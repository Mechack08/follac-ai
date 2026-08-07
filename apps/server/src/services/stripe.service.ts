/**
 * Stripe billing — checkout, customer portal, and webhook-driven
 * subscription state. The subscriptions table is the source of truth
 * for entitlements; Stripe webhooks keep it in sync.
 */
import Stripe from "stripe";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, newId, plans, subscriptions, user as userTable } from "@follac/db";
import { config } from "../config.js";
import { sendPaymentFailedEmail } from "./email.service.js";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!config.stripe.secretKey) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(config.stripe.secretKey, { apiVersion: "2025-02-24.acacia" });
  }
  return _stripe;
}

async function ensureCustomer(userId: string, email: string, name: string): Promise<string> {
  const db = getDb();
  const [u] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
  if (u?.stripeCustomerId) return u.stripeCustomerId;

  const customer = await getStripe().customers.create({
    email,
    name,
    metadata: { userId },
  });
  await db.update(userTable).set({ stripeCustomerId: customer.id }).where(eq(userTable.id, userId));
  return customer.id;
}

export async function createCheckoutSession(input: {
  userId: string;
  email: string;
  name: string;
  planId: string;
}): Promise<string> {
  const db = getDb();
  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  if (!plan || !plan.stripePriceId) {
    throw new Error(`Plan ${input.planId} is not purchasable (no Stripe price configured)`);
  }

  const customerId = await ensureCustomer(input.userId, input.email, input.name);
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${config.webUrl}/dashboard/billing?status=success`,
    cancel_url: `${config.webUrl}/dashboard/billing?status=cancelled`,
    metadata: { userId: input.userId, planId: input.planId },
    subscription_data: { metadata: { userId: input.userId, planId: input.planId } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalSession(stripeCustomerId: string): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${config.webUrl}/dashboard/billing`,
  });
  return session.url;
}

// ─── Webhook handling ─────────────────────────────────────────────────────────

export function constructWebhookEvent(rawBody: string | Buffer, signature: string): Stripe.Event {
  return getStripe().webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

function mapStatus(status: Stripe.Subscription.Status): "trialing" | "active" | "past_due" | "canceled" | "expired" {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "expired";
  }
}

async function upsertFromStripeSubscription(sub: Stripe.Subscription): Promise<void> {
  const db = getDb();
  const userId = sub.metadata["userId"];
  const planId = sub.metadata["planId"];
  if (!userId || !planId) return;

  const values = {
    status: mapStatus(sub.status),
    planId,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id))
    .limit(1);

  if (existing) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
  } else {
    // First payment: retire the trial and create the paid subscription row
    await db
      .update(subscriptions)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.planId, "trial"),
          inArray(subscriptions.status, ["trialing", "active"]),
        ),
      );
    await db.insert(subscriptions).values({
      id: newId("sub"),
      userId,
      stripeSubscriptionId: sub.id,
      ...values,
    });
  }
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const sub = await getStripe().subscriptions.retrieve(
          typeof session.subscription === "string" ? session.subscription : session.subscription.id,
        );
        await upsertFromStripeSubscription(sub);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await upsertFromStripeSubscription(event.data.object);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        const db = getDb();
        const [u] = await db
          .select()
          .from(userTable)
          .where(eq(userTable.stripeCustomerId, customerId))
          .limit(1);
        if (u) await sendPaymentFailedEmail(u.email, u.name);
      }
      break;
    }
    default:
      break;
  }
}
