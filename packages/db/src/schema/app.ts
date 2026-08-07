/**
 * Follac application tables — meetings pipeline, billing, API access, admin.
 */
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const meetingPlatformEnum = pgEnum("meeting_platform", [
  "google_meet",
  "zoom",
  "teams",
  "other",
]);

export const meetingStatusEnum = pgEnum("meeting_status", [
  "scheduled",
  "bot_dispatched",
  "recording",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const actionItemStatusEnum = pgEnum("action_item_status", [
  "open",
  "in_progress",
  "done",
  "dismissed",
]);

export const reportTypeEnum = pgEnum("report_type", ["full", "summary"]);

export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "sent",
  "failed",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

export const usageKindEnum = pgEnum("usage_kind", [
  "meeting_seconds",
  "api_call",
  "report_sent",
  "extension_action",
]);

// ─── Organizations (Business tier team workspaces) ───────────────────────────

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 'owner' | 'admin' | 'member' */
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("org_members_org_idx").on(t.organizationId), index("org_members_user_idx").on(t.userId)],
);

// ─── User settings (report + recording preferences) ──────────────────────────

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  sendFullReport: boolean("send_full_report").notNull().default(true),
  sendSummaryReport: boolean("send_summary_report").notNull().default(true),
  /** 'all' | 'external_only' | 'none' — which calendar meetings get a bot */
  autoRecordMode: text("auto_record_mode").notNull().default("all"),
  botName: text("bot_name").notNull().default("Follac Notetaker"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Calendar connections ─────────────────────────────────────────────────────

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("google"),
    /** Email of the connected calendar account */
    email: text("email").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    syncEnabled: boolean("sync_enabled").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("calendar_connections_user_idx").on(t.userId)],
);

// ─── Meetings pipeline ────────────────────────────────────────────────────────

export const meetings = pgTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    calendarEventId: text("calendar_event_id"),
    title: text("title").notNull(),
    meetingUrl: text("meeting_url").notNull(),
    platform: meetingPlatformEnum("platform").notNull().default("other"),
    status: meetingStatusEnum("status").notNull().default("scheduled"),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    /** External bot id (Recall.ai) once dispatched */
    botId: text("bot_id"),
    recordingUrl: text("recording_url"),
    durationSeconds: integer("duration_seconds"),
    /** LLM-generated insights (filled during processing) */
    summary: text("summary"),
    keyPoints: jsonb("key_points").$type<string[]>(),
    decisions: jsonb("decisions").$type<string[]>(),
    speakerStats: jsonb("speaker_stats").$type<
      Array<{ speaker: string; talkTimeSeconds: number; talkTimePercent: number; keyPoints: string[] }>
    >(),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("meetings_user_idx").on(t.userId),
    index("meetings_status_idx").on(t.status),
    index("meetings_bot_idx").on(t.botId),
    index("meetings_event_idx").on(t.userId, t.calendarEventId),
  ],
);

export const transcripts = pgTable(
  "transcripts",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("deepgram"),
    language: text("language"),
    /** Raw provider response for reprocessing/debugging */
    raw: jsonb("raw"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("transcripts_meeting_idx").on(t.meetingId)],
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: text("id").primaryKey(),
    transcriptId: text("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    /** Diarization label, e.g. "Speaker 0" */
    speakerLabel: text("speaker_label").notNull(),
    /** Resolved human name when available (from meeting participants) */
    speakerName: text("speaker_name"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
  },
  (t) => [
    index("segments_transcript_idx").on(t.transcriptId),
    index("segments_meeting_idx").on(t.meetingId, t.startMs),
  ],
);

export const actionItems = pgTable(
  "action_items",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    /** Person responsible, as identified in the meeting */
    owner: text("owner"),
    dueDate: timestamp("due_date"),
    status: actionItemStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("action_items_user_idx").on(t.userId, t.status), index("action_items_meeting_idx").on(t.meetingId)],
);

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: reportTypeEnum("type").notNull(),
    subject: text("subject").notNull(),
    sentTo: text("sent_to").notNull(),
    status: reportStatusEnum("status").notNull().default("pending"),
    /** Provider message id (Resend) */
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("reports_meeting_idx").on(t.meetingId), index("reports_user_idx").on(t.userId)],
);

// ─── Billing ──────────────────────────────────────────────────────────────────

export const plans = pgTable("plans", {
  /** slug primary key: 'trial' | 'starter' | 'pro' | 'business' */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  priceMonthlyCents: integer("price_monthly_cents").notNull(),
  stripePriceId: text("stripe_price_id"),
  /** Metered cap; null = unlimited */
  meetingHoursPerMonth: integer("meeting_hours_per_month"),
  /** Feature flags consumed by the entitlements module */
  features: jsonb("features")
    .$type<{
      actionItemTracking: boolean;
      speakerAnalytics: boolean;
      unlimitedHistory: boolean;
      extensionActions: boolean;
      apiAccess: boolean;
      teamWorkspace: boolean;
      webhooks: boolean;
    }>()
    .notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripeCustomerId: text("stripe_customer_id"),
    status: subscriptionStatusEnum("status").notNull(),
    trialEndsAt: timestamp("trial_ends_at"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId), index("subscriptions_status_idx").on(t.status)],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: usageKindEnum("kind").notNull(),
    quantity: integer("quantity").notNull(),
    meetingId: text("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("usage_user_kind_idx").on(t.userId, t.kind, t.createdAt)],
);

// ─── Public API ───────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 hash of the full key — the plaintext is shown once at creation */
    keyHash: text("key_hash").notNull().unique(),
    /** First 12 chars (e.g. "flc_live_ab12") shown in the UI for identification */
    prefix: text("prefix").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** HMAC secret used to sign deliveries */
    secret: text("secret").notNull(),
    /** Subscribed events, e.g. ["meeting.completed", "report.ready"] */
    events: jsonb("events").$type<string[]>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("webhook_endpoints_user_idx").on(t.userId)],
);

// ─── Admin ────────────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_logs_actor_idx").on(t.actorId), index("audit_logs_created_idx").on(t.createdAt)],
);
