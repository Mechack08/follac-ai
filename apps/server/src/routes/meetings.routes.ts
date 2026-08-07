/**
 * Meetings + action items — the dashboard's primary data source.
 *
 * GET    /api/meetings                 — list the user's meetings
 * POST   /api/meetings                 — invite the bot to a meeting by URL
 * GET    /api/meetings/:id             — meeting detail (insights, transcript, reports)
 * PATCH  /api/meetings/:id             — toggle join / update scheduled meeting
 * DELETE /api/meetings/:id             — cancel a scheduled meeting / remove the bot
 * GET    /api/action-items             — action items across meetings
 * PATCH  /api/action-items/:id         — update an action item's status
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  getDb,
  newId,
  actionItems,
  meetings,
  reports,
  transcriptSegments,
  userSettings,
} from "@follac/db";
import { requireUser } from "../lib/session.js";
import { getEntitlements } from "../lib/entitlements.js";
import { detectPlatform, meetingBotProvider } from "../services/meeting-bot.service.js";

const CreateMeetingBody = z.object({
  meetingUrl: z.string().url(),
  title: z.string().min(1).max(200).optional(),
});

const UpdateMeetingBody = z.object({
  joinEnabled: z.boolean().optional(),
});

const UpdateActionItemBody = z.object({
  status: z.enum(["open", "in_progress", "done", "dismissed"]),
});

export async function meetingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireUser);

  fastify.get("/meetings", async (request) => {
    const db = getDb();
    const userId = request.sessionUser!.id;
    const rows = await db
      .select({
        id: meetings.id,
        title: meetings.title,
        platform: meetings.platform,
        status: meetings.status,
        startsAt: meetings.startsAt,
        endsAt: meetings.endsAt,
        durationSeconds: meetings.durationSeconds,
        summary: meetings.summary,
        joinEnabled: meetings.joinEnabled,
        hasExternalGuests: meetings.hasExternalGuests,
        calendarEventId: meetings.calendarEventId,
        createdAt: meetings.createdAt,
      })
      .from(meetings)
      .where(eq(meetings.userId, userId))
      .orderBy(desc(meetings.startsAt), desc(meetings.createdAt))
      .limit(100);
    return { meetings: rows };
  });

  fastify.post("/meetings", async (request, reply) => {
    const body = CreateMeetingBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "A valid meeting URL is required" });
    }
    const userId = request.sessionUser!.id;

    const entitlements = await getEntitlements(userId);
    if (!entitlements.canRecord) {
      return reply.status(402).send({
        error: "Plan limit reached",
        message:
          entitlements.status === "expired" || entitlements.status === "none"
            ? "Your trial has ended. Upgrade to keep recording meetings."
            : "You've used this month's meeting hours. Upgrade for more.",
      });
    }

    const db = getDb();
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const meetingId = newId("mtg");
    try {
      const { botId } = await meetingBotProvider.dispatchBot({
        meetingUrl: body.data.meetingUrl,
        botName: settings?.botName ?? "Follac Notetaker",
        meetingId,
      });
      await db.insert(meetings).values({
        id: meetingId,
        userId,
        title: body.data.title ?? "Meeting",
        meetingUrl: body.data.meetingUrl,
        platform: detectPlatform(body.data.meetingUrl),
        status: "bot_dispatched",
        startsAt: new Date(),
        botId,
        joinEnabled: true,
      });
      return reply.status(201).send({ id: meetingId, status: "bot_dispatched" });
    } catch (err) {
      fastify.log.error({ err: String(err) }, "Manual bot dispatch failed");
      return reply.status(502).send({ error: "Could not send the bot to that meeting. Check the URL." });
    }
  });

  fastify.get("/meetings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const userId = request.sessionUser!.id;

    const [meeting] = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), eq(meetings.userId, userId)))
      .limit(1);
    if (!meeting) return reply.status(404).send({ error: "Meeting not found" });

    const [segments, items, meetingReports] = await Promise.all([
      db
        .select({
          id: transcriptSegments.id,
          speakerLabel: transcriptSegments.speakerLabel,
          speakerName: transcriptSegments.speakerName,
          startMs: transcriptSegments.startMs,
          endMs: transcriptSegments.endMs,
          text: transcriptSegments.text,
        })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.meetingId, id))
        .orderBy(asc(transcriptSegments.startMs)),
      db.select().from(actionItems).where(eq(actionItems.meetingId, id)),
      db.select().from(reports).where(eq(reports.meetingId, id)),
    ]);

    return { meeting, segments, actionItems: items, reports: meetingReports };
  });

  fastify.patch("/meetings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateMeetingBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid meeting update" });

    const db = getDb();
    const userId = request.sessionUser!.id;
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), eq(meetings.userId, userId)))
      .limit(1);
    if (!meeting) return reply.status(404).send({ error: "Meeting not found" });

    if (body.data.joinEnabled === undefined) {
      return reply.status(400).send({ error: "Nothing to update" });
    }

    const joinEnabled = body.data.joinEnabled;

    // Turning join off after the bot was sent: pull the bot back
    if (
      !joinEnabled &&
      meeting.botId &&
      (meeting.status === "bot_dispatched" || meeting.status === "recording")
    ) {
      try {
        await meetingBotProvider.removeBot(meeting.botId);
      } catch (err) {
        fastify.log.warn({ err: String(err), meetingId: id }, "Failed to remove bot while disabling join");
      }
      const [updated] = await db
        .update(meetings)
        .set({
          joinEnabled: false,
          botId: null,
          status: "scheduled",
          updatedAt: new Date(),
        })
        .where(eq(meetings.id, id))
        .returning({
          id: meetings.id,
          joinEnabled: meetings.joinEnabled,
          status: meetings.status,
        });
      return updated;
    }

    if (meeting.status !== "scheduled" && meeting.status !== "bot_dispatched") {
      return reply
        .status(409)
        .send({ error: `Cannot change join for a meeting in status "${meeting.status}"` });
    }

    const [updated] = await db
      .update(meetings)
      .set({ joinEnabled, updatedAt: new Date() })
      .where(eq(meetings.id, id))
      .returning({
        id: meetings.id,
        joinEnabled: meetings.joinEnabled,
        status: meetings.status,
      });
    return updated;
  });

  fastify.delete("/meetings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const userId = request.sessionUser!.id;

    const [meeting] = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), eq(meetings.userId, userId)))
      .limit(1);
    if (!meeting) return reply.status(404).send({ error: "Meeting not found" });

    if (meeting.botId && (meeting.status === "bot_dispatched" || meeting.status === "recording")) {
      await meetingBotProvider.removeBot(meeting.botId);
    }
    if (meeting.status === "scheduled" || meeting.status === "bot_dispatched") {
      await db
        .update(meetings)
        .set({ status: "cancelled", joinEnabled: false, updatedAt: new Date() })
        .where(eq(meetings.id, id));
      return { status: "cancelled" };
    }
    return reply.status(409).send({ error: `Cannot cancel a meeting in status "${meeting.status}"` });
  });

  // ─── Action items ───────────────────────────────────────────────────────────

  fastify.get("/action-items", async (request) => {
    const db = getDb();
    const userId = request.sessionUser!.id;
    const items = await db
      .select({
        id: actionItems.id,
        meetingId: actionItems.meetingId,
        meetingTitle: meetings.title,
        description: actionItems.description,
        owner: actionItems.owner,
        dueDate: actionItems.dueDate,
        status: actionItems.status,
        createdAt: actionItems.createdAt,
      })
      .from(actionItems)
      .innerJoin(meetings, eq(meetings.id, actionItems.meetingId))
      .where(eq(actionItems.userId, userId))
      .orderBy(desc(actionItems.createdAt))
      .limit(200);
    return { actionItems: items };
  });

  fastify.patch("/action-items/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateActionItemBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid status" });

    const db = getDb();
    const userId = request.sessionUser!.id;
    const [updated] = await db
      .update(actionItems)
      .set({ status: body.data.status, updatedAt: new Date() })
      .where(and(eq(actionItems.id, id), eq(actionItems.userId, userId)))
      .returning({ id: actionItems.id, status: actionItems.status });
    if (!updated) return reply.status(404).send({ error: "Action item not found" });
    return updated;
  });
}
