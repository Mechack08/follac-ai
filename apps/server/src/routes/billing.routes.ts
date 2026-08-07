/**
 * Billing — pricing catalog, current subscription + usage, checkout, portal.
 *
 * GET  /api/billing/plans         — public pricing catalog
 * GET  /api/billing/subscription  — current plan, status, usage meters
 * POST /api/billing/checkout      — start a Stripe Checkout session
 * POST /api/billing/portal        — open the Stripe Customer Portal
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PLAN_CATALOG } from "@follac/db";
import { requireUser } from "../lib/session.js";
import { getEntitlements } from "../lib/entitlements.js";
import { createCheckoutSession, createPortalSession } from "../services/stripe.service.js";

const CheckoutBody = z.object({
  planId: z.enum(["starter", "pro", "business"]),
});

export async function billingRoutes(fastify: FastifyInstance): Promise<void> {
  // Public pricing — the marketing page reads this
  fastify.get("/plans", async () => {
    return {
      plans: Object.values(PLAN_CATALOG).map((p) => ({
        id: p.id,
        name: p.name,
        priceMonthlyCents: p.priceMonthlyCents,
        meetingHoursPerMonth: p.meetingHoursPerMonth,
        highlights: p.highlights,
        sortOrder: p.sortOrder,
      })),
    };
  });

  fastify.register(async (authed) => {
    authed.addHook("preHandler", requireUser);

    authed.get("/subscription", async (request) => {
      const entitlements = await getEntitlements(request.sessionUser!.id);
      return {
        planId: entitlements.planId,
        planName: entitlements.plan.name,
        status: entitlements.status,
        trialEndsAt: entitlements.trialEndsAt,
        meetingSecondsLimit: entitlements.meetingSecondsLimit,
        meetingSecondsUsed: entitlements.meetingSecondsUsed,
        trialMeetingsUsed: entitlements.trialMeetingsUsed,
        trialMeetingCap: entitlements.trialMeetingCap,
        canRecord: entitlements.canRecord,
        features: entitlements.features,
      };
    });

    authed.post("/checkout", async (request, reply) => {
      const body = CheckoutBody.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "Invalid plan" });
      const user = request.sessionUser!;
      try {
        const url = await createCheckoutSession({
          userId: user.id,
          email: user.email,
          name: user.name,
          planId: body.data.planId,
        });
        return { url };
      } catch (err) {
        fastify.log.error({ err: String(err) }, "Checkout session failed");
        return reply.status(502).send({ error: "Could not start checkout. Try again shortly." });
      }
    });

    authed.post("/portal", async (request, reply) => {
      const user = request.sessionUser!;
      if (!user.stripeCustomerId) {
        return reply.status(409).send({ error: "No billing account yet. Subscribe to a plan first" });
      }
      const url = await createPortalSession(user.stripeCustomerId);
      return { url };
    });
  });
}
