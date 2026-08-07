/**
 * Entitlements — the single module every metered or gated action goes
 * through. Reads the user's effective subscription and usage for the
 * current period and answers "can they do X?".
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  getDb,
  getPlan,
  subscriptions,
  usageRecords,
  newId,
  TRIAL_MEETING_CAP,
  type PlanDefinition,
  type PlanFeatures,
} from "@follac/db";

export interface Entitlements {
  planId: string;
  plan: PlanDefinition;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired" | "none";
  trialEndsAt: Date | null;
  /** null = unlimited */
  meetingSecondsLimit: number | null;
  meetingSecondsUsed: number;
  /** Trial-only meeting count cap */
  trialMeetingsUsed: number;
  trialMeetingCap: number;
  canRecord: boolean;
  features: PlanFeatures;
}

const ACCESS_STATUSES = ["trialing", "active", "past_due"] as const;

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const db = getDb();

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, [...ACCESS_STATUSES])))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const trialExpired =
    sub?.status === "trialing" && sub.trialEndsAt !== null && sub.trialEndsAt < new Date();

  if (!sub || trialExpired) {
    const plan = getPlan("trial");
    return {
      planId: "trial",
      plan,
      status: sub ? "expired" : "none",
      trialEndsAt: sub?.trialEndsAt ?? null,
      meetingSecondsLimit: 0,
      meetingSecondsUsed: 0,
      trialMeetingsUsed: 0,
      trialMeetingCap: TRIAL_MEETING_CAP,
      canRecord: false,
      features: {
        actionItemTracking: false,
        speakerAnalytics: false,
        unlimitedHistory: false,
        extensionActions: false,
        apiAccess: false,
        teamWorkspace: false,
        webhooks: false,
      },
    };
  }

  const plan = getPlan(sub.planId);
  const periodStart = sub.currentPeriodStart ?? sub.createdAt;

  const [usage] = await db
    .select({
      seconds: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)`.mapWith(Number),
      meetings: sql<number>`count(*)`.mapWith(Number),
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        eq(usageRecords.kind, "meeting_seconds"),
        gte(usageRecords.createdAt, periodStart),
      ),
    );

  const meetingSecondsUsed = usage?.seconds ?? 0;
  const trialMeetingsUsed = usage?.meetings ?? 0;

  const meetingSecondsLimit =
    plan.meetingHoursPerMonth === null ? null : plan.meetingHoursPerMonth * 3600;

  const canRecord =
    sub.planId === "trial"
      ? trialMeetingsUsed < TRIAL_MEETING_CAP
      : meetingSecondsLimit === null || meetingSecondsUsed < meetingSecondsLimit;

  return {
    planId: sub.planId,
    plan,
    status: sub.status as Entitlements["status"],
    trialEndsAt: sub.trialEndsAt,
    meetingSecondsLimit,
    meetingSecondsUsed,
    trialMeetingsUsed,
    trialMeetingCap: TRIAL_MEETING_CAP,
    canRecord,
    features: plan.features,
  };
}

export async function hasFeature(userId: string, feature: keyof PlanFeatures): Promise<boolean> {
  const ent = await getEntitlements(userId);
  return ent.features[feature];
}

/** Record consumed usage (called by the worker when a meeting finishes processing) */
export async function recordUsage(
  userId: string,
  kind: "meeting_seconds" | "api_call" | "report_sent" | "extension_action",
  quantity: number,
  meetingId?: string,
): Promise<void> {
  const db = getDb();
  await db.insert(usageRecords).values({
    id: newId("usg"),
    userId,
    kind,
    quantity,
    meetingId: meetingId ?? null,
  });
}
