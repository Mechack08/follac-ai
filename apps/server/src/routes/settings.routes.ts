/**
 * User settings — report preferences and bot behavior.
 *
 * GET   /api/settings
 * PATCH /api/settings
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, meetings, userSettings } from "@follac/db";
import { requireUser } from "../lib/session.js";
import { defaultJoinEnabled, type AutoRecordMode } from "../services/calendar.service.js";

const UpdateBody = z.object({
  sendFullReport: z.boolean().optional(),
  sendSummaryReport: z.boolean().optional(),
  autoRecordMode: z.enum(["all", "ask", "external_only", "none"]).optional(),
  botName: z.string().min(1).max(60).optional(),
});

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireUser);

  fastify.get("/settings", async (request) => {
    const db = getDb();
    const userId = request.sessionUser!.id;
    let [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    if (!settings) {
      [settings] = await db.insert(userSettings).values({ userId }).returning();
    }
    return { settings };
  });

  fastify.patch("/settings", async (request, reply) => {
    const body = UpdateBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid settings payload" });

    const db = getDb();
    const userId = request.sessionUser!.id;
    await db.insert(userSettings).values({ userId }).onConflictDoNothing();

    const [before] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const [settings] = await db
      .update(userSettings)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();

    // Re-apply default join flags only when the mode itself changes
    if (
      body.data.autoRecordMode &&
      body.data.autoRecordMode !== before?.autoRecordMode
    ) {
      const mode = body.data.autoRecordMode as AutoRecordMode;
      const scheduled = await db
        .select({
          id: meetings.id,
          hasExternalGuests: meetings.hasExternalGuests,
        })
        .from(meetings)
        .where(and(eq(meetings.userId, userId), eq(meetings.status, "scheduled")));

      for (const row of scheduled) {
        await db
          .update(meetings)
          .set({
            joinEnabled: defaultJoinEnabled(mode, row.hasExternalGuests ?? false),
            updatedAt: new Date(),
          })
          .where(eq(meetings.id, row.id));
      }
    }

    return { settings };
  });
}
