/**
 * Canonical plan catalog. The `plans` table is seeded from this and the
 * entitlements module reads from it. Stripe price IDs are attached via env
 * at seed time; everything else about a plan lives here in code.
 */

export interface PlanFeatures {
  actionItemTracking: boolean;
  speakerAnalytics: boolean;
  unlimitedHistory: boolean;
  extensionActions: boolean;
  apiAccess: boolean;
  teamWorkspace: boolean;
  webhooks: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceMonthlyCents: number;
  /** null = unlimited */
  meetingHoursPerMonth: number | null;
  /** Transcript history retention in days; null = unlimited */
  historyDays: number | null;
  features: PlanFeatures;
  sortOrder: number;
  /** Marketing bullets for the pricing page */
  highlights: string[];
}

export type PlanId = "trial" | "starter" | "pro" | "business";

export const TRIAL_DAYS = 7;
export const TRIAL_MEETING_CAP = 5;

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  trial: {
    id: "trial",
    name: "Free Trial",
    priceMonthlyCents: 0,
    meetingHoursPerMonth: null, // capped by meeting count instead
    historyDays: null,
    features: {
      actionItemTracking: true,
      speakerAnalytics: true,
      unlimitedHistory: true,
      extensionActions: true,
      apiAccess: false,
      teamWorkspace: false,
      webhooks: false,
    },
    sortOrder: 0,
    highlights: [
      "7 days of full Pro features",
      `Up to ${TRIAL_MEETING_CAP} recorded meetings`,
      "No credit card required",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthlyCents: 1200,
    meetingHoursPerMonth: 8,
    historyDays: 30,
    features: {
      actionItemTracking: false,
      speakerAnalytics: false,
      unlimitedHistory: false,
      extensionActions: false,
      apiAccess: false,
      teamWorkspace: false,
      webhooks: false,
    },
    sortOrder: 1,
    highlights: [
      "8 meeting-hours per month",
      "AI summaries + email reports",
      "30-day transcript history",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyCents: 2900,
    meetingHoursPerMonth: 30,
    historyDays: null,
    features: {
      actionItemTracking: true,
      speakerAnalytics: true,
      unlimitedHistory: true,
      extensionActions: true,
      apiAccess: false,
      teamWorkspace: false,
      webhooks: false,
    },
    sortOrder: 2,
    highlights: [
      "30 meeting-hours per month",
      "Action-item tracking with owners",
      "Who-said-what speaker analytics",
      "Unlimited history + priority processing",
      "In-page assistant (Gmail, Docs, LinkedIn)",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    priceMonthlyCents: 5900,
    meetingHoursPerMonth: null,
    historyDays: null,
    features: {
      actionItemTracking: true,
      speakerAnalytics: true,
      unlimitedHistory: true,
      extensionActions: true,
      apiAccess: true,
      teamWorkspace: true,
      webhooks: true,
    },
    sortOrder: 3,
    highlights: [
      "Unlimited meeting-hours",
      "Team workspace + shared meeting library",
      "Full REST API + outbound webhooks",
      "Admin seat management",
    ],
  },
};

export function getPlan(id: string): PlanDefinition {
  const plan = PLAN_CATALOG[id as PlanId];
  return plan ?? PLAN_CATALOG.trial;
}

/** Env var name that holds the Stripe price id for a paid plan */
export function stripePriceEnvKey(planId: PlanId): string {
  return `STRIPE_PRICE_${planId.toUpperCase()}`;
}
