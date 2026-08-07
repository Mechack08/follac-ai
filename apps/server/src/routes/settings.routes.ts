/**
 * User settings — report preferences and bot behavior.
 *
 * GET   /api/settings
 * PATCH /api/settings
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, userSettings } from "@follac/db";
import { requireUser } from "../lib/session.js";

const UpdateBody = z.object({
  sendFullReport: z.boolean().optional(),
  sendSummaryReport: z.boolean().optional(),
  autoRecordMode: z.enum(["all", "external_only", "none"]).optional(),
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
    const [settings] = await db
      .update(userSettings)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();
    return { settings };
  });
}
