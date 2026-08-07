/**
 * In-process scheduler. Every few minutes it:
 *  1. Syncs enabled calendar connections (upserting upcoming meetings)
 *  2. Dispatches bots for meetings starting within the lead window
 *  3. Expires overdue trials and sends "trial ending" reminders
 *
 * Kept in the server (not the worker) because it needs the Recall and
 * Google Calendar clients that already live here.
 */
import { and, eq, gte, isNull, lte, inArray } from "drizzle-orm";
import {
  getDb,
  newId,
  auditLogs,
  calendarConnections,
  meetings,
  subscriptions,
  user as userTable,
  userSettings,
} from "@follac/db";
import { config } from "../config.js";
import { syncConnection } from "../services/calendar.service.js";
import { meetingBotProvider } from "../services/meeting-bot.service.js";
import { sendTrialEndingEmail } from "../services/email.service.js";
import { getEntitlements } from "./entitlements.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), config.calendar.syncIntervalMs);
  // First pass shortly after boot so dev servers behave predictably
  setTimeout(() => void tick(), 10_000);
  console.warn(
    `[scheduler] Started — interval ${Math.round(config.calendar.syncIntervalMs / 1000)}s`,
  );
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(): Promise<void> {
  if (running) return; // never overlap passes
  running = true;
  try {
    await syncCalendars();
    await dispatchDueBots();
    await handleTrials();
  } catch (err) {
    console.error("[scheduler] tick failed:", err);
  } finally {
    running = false;
  }
}

async function syncCalendars(): Promise<void> {
  const db = getDb();
  const connections = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.syncEnabled, true));

  for (const conn of connections) {
    try {
      await syncConnection(conn);
    } catch (err) {
      console.error(`[scheduler] calendar sync failed for ${conn.id}:`, err);
    }
  }
}

async function dispatchDueBots(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + config.calendar.botLeadMinutes * 60_000);
  // Also catch meetings that started up to 10 minutes ago (late sync)
  const windowStart = new Date(now.getTime() - 10 * 60_000);

  const due = await db
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.status, "scheduled"),
        isNull(meetings.botId),
        gte(meetings.startsAt, windowStart),
        lte(meetings.startsAt, windowEnd),
      ),
    );

  for (const meeting of due) {
    try {
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, meeting.userId))
        .limit(1);

      if (settings?.autoRecordMode === "none") continue;

      const entitlements = await getEntitlements(meeting.userId);
      if (!entitlements.canRecord) {
        await db
          .update(meetings)
          .set({
            status: "cancelled",
            error: "Plan limit reached — upgrade to keep recording meetings",
            updatedAt: new Date(),
          })
          .where(eq(meetings.id, meeting.id));
        continue;
      }

      const { botId } = await meetingBotProvider.dispatchBot({
        meetingUrl: meeting.meetingUrl,
        botName: settings?.botName ?? "Follac Notetaker",
        meetingId: meeting.id,
      });
      await db
        .update(meetings)
        .set({ botId, status: "bot_dispatched", updatedAt: new Date() })
        .where(eq(meetings.id, meeting.id));
    } catch (err) {
      console.error(`[scheduler] bot dispatch failed for meeting ${meeting.id}:`, err);
      await db
        .update(meetings)
        .set({ status: "failed", error: String(err), updatedAt: new Date() })
        .where(eq(meetings.id, meeting.id));
    }
  }
}

async function handleTrials(): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Expire overdue trials
  await db
    .update(subscriptions)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(subscriptions.status, "trialing"),
        eq(subscriptions.planId, "trial"),
        lte(subscriptions.trialEndsAt, now),
      ),
    );

  // Remind users whose trial ends within 24h (once per user)
  const endingSoon = await db
    .select({
      subId: subscriptions.id,
      userId: subscriptions.userId,
      email: userTable.email,
      name: userTable.name,
    })
    .from(subscriptions)
    .innerJoin(userTable, eq(userTable.id, subscriptions.userId))
    .where(
      and(
        eq(subscriptions.status, "trialing"),
        eq(subscriptions.planId, "trial"),
        gte(subscriptions.trialEndsAt, now),
        lte(subscriptions.trialEndsAt, new Date(now.getTime() + 24 * 3600 * 1000)),
      ),
    );

  if (endingSoon.length === 0) return;

  const alreadyNotified = await db
    .select({ targetId: auditLogs.targetId })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "email.trial_ending"),
        inArray(
          auditLogs.targetId,
          endingSoon.map((s) => s.userId),
        ),
      ),
    );
  const notifiedIds = new Set(alreadyNotified.map((n) => n.targetId));

  for (const sub of endingSoon) {
    if (notifiedIds.has(sub.userId)) continue;
    try {
      await sendTrialEndingEmail(sub.email, sub.name);
      await db.insert(auditLogs).values({
        id: newId("log"),
        actorId: null,
        action: "email.trial_ending",
        targetType: "user",
        targetId: sub.userId,
      });
    } catch (err) {
      console.error(`[scheduler] trial-ending email failed for ${sub.userId}:`, err);
    }
  }
}
