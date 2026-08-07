/**
 * Public REST API — versioned under /v1, authenticated with API keys.
 *
 * GET  /v1/meetings
 * POST /v1/meetings                    — invite the bot to a meeting
 * GET  /v1/meetings/:id
 * GET  /v1/meetings/:id/transcript
 * GET  /v1/action-items
 * GET  /v1/openapi.json                — machine-readable spec (public)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  getDb,
  newId,
  actionItems,
  meetings,
  transcriptSegments,
  userSettings,
} from "@follac/db";
import { apiKeyAuth } from "../lib/api-keys.js";
import { getEntitlements, recordUsage } from "../lib/entitlements.js";
import { detectPlatform, meetingBotProvider } from "../services/meeting-bot.service.js";
import { openApiSpec } from "../lib/openapi.js";

const CreateMeetingBody = z.object({
  meeting_url: z.string().url(),
  title: z.string().max(200).optional(),
});

function serializeMeeting(m: typeof meetings.$inferSelect) {
  return {
    id: m.id,
    title: m.title,
    platform: m.platform,
    status: m.status,
    starts_at: m.startsAt?.toISOString() ?? null,
    duration_seconds: m.durationSeconds,
    summary: m.summary,
    key_points: m.keyPoints ?? [],
    decisions: m.decisions ?? [],
    speaker_stats: m.speakerStats ?? [],
    created_at: m.createdAt.toISOString(),
  };
}

export async function v1Routes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/openapi.json", { config: { rateLimit: false } }, async () => openApiSpec);

  fastify.register(async (api) => {
    api.addHook("preHandler", apiKeyAuth);
    api.addHook("onResponse", async (request) => {
      if (request.apiUser) {
        await recordUsage(request.apiUser.userId, "api_call", 1);
      }
    });

    api.get("/meetings", async (request) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(meetings)
        .where(eq(meetings.userId, request.apiUser!.userId))
        .orderBy(desc(meetings.createdAt))
        .limit(100);
      return { data: rows.map(serializeMeeting) };
    });

    api.post("/meetings", async (request, reply) => {
      const body = CreateMeetingBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "invalid_request", message: "meeting_url must be a valid URL" });
      }
      const userId = request.apiUser!.userId;

      const entitlements = await getEntitlements(userId);
      if (!entitlements.canRecord) {
        return reply.status(402).send({ error: "plan_limit", message: "Meeting-hour limit reached" });
      }

      const db = getDb();
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      const meetingId = newId("mtg");
      const { botId } = await meetingBotProvider.dispatchBot({
        meetingUrl: body.data.meeting_url,
        botName: settings?.botName ?? "Follac Notetaker",
        meetingId,
      });
      await db.insert(meetings).values({
        id: meetingId,
        userId,
        title: body.data.title ?? "Meeting",
        meetingUrl: body.data.meeting_url,
        platform: detectPlatform(body.data.meeting_url),
        status: "bot_dispatched",
        startsAt: new Date(),
        botId,
      });
      return reply.status(201).send({ data: { id: meetingId, status: "bot_dispatched" } });
    });

    api.get("/meetings/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const db = getDb();
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(and(eq(meetings.id, id), eq(meetings.userId, request.apiUser!.userId)))
        .limit(1);
      if (!meeting) return reply.status(404).send({ error: "not_found" });
      return { data: serializeMeeting(meeting) };
    });

    api.get("/meetings/:id/transcript", async (request, reply) => {
      const { id } = request.params as { id: string };
      const db = getDb();
      const [meeting] = await db
        .select({ id: meetings.id })
        .from(meetings)
        .where(and(eq(meetings.id, id), eq(meetings.userId, request.apiUser!.userId)))
        .limit(1);
      if (!meeting) return reply.status(404).send({ error: "not_found" });

      const segments = await db
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.meetingId, id))
        .orderBy(asc(transcriptSegments.startMs));
      return {
        data: segments.map((s) => ({
          speaker: s.speakerName ?? s.speakerLabel,
          start_ms: s.startMs,
          end_ms: s.endMs,
          text: s.text,
        })),
      };
    });

    api.get("/action-items", async (request) => {
      const db = getDb();
      const items = await db
        .select()
        .from(actionItems)
        .where(eq(actionItems.userId, request.apiUser!.userId))
        .orderBy(desc(actionItems.createdAt))
        .limit(200);
      return {
        data: items.map((item) => ({
          id: item.id,
          meeting_id: item.meetingId,
          description: item.description,
          owner: item.owner,
          due_date: item.dueDate?.toISOString() ?? null,
          status: item.status,
        })),
      };
    });
  });
}
