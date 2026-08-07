/**
 * Google Calendar connection management.
 *
 * GET    /api/calendar/connect          — returns the Google consent URL
 * GET    /api/calendar/callback         — OAuth redirect target (public)
 * GET    /api/calendar/connections      — list connections
 * PATCH  /api/calendar/connections/:id  — toggle sync
 * DELETE /api/calendar/connections/:id  — disconnect
 * POST   /api/calendar/sync             — manual sync now
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, calendarConnections } from "@follac/db";
import { config } from "../config.js";
import { requireUser } from "../lib/session.js";
import {
  completeConnection,
  getConnectUrl,
  syncConnection,
  verifyState,
} from "../services/calendar.service.js";

const ToggleBody = z.object({ syncEnabled: z.boolean() });

export async function calendarRoutes(fastify: FastifyInstance): Promise<void> {
  // OAuth callback is hit by Google's redirect — no session cookie guaranteed
  fastify.get("/callback", async (request, reply) => {
    const { code, state, error } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };
    if (error || !code || !state) {
      return reply.redirect(`${config.webUrl}/dashboard/settings?calendar=error`);
    }
    const userId = verifyState(state);
    if (!userId) {
      return reply.redirect(`${config.webUrl}/dashboard/settings?calendar=invalid_state`);
    }
    try {
      await completeConnection(userId, code);
      return reply.redirect(`${config.webUrl}/dashboard/settings?calendar=connected`);
    } catch (err) {
      fastify.log.error({ err: String(err) }, "Calendar connection failed");
      return reply.redirect(`${config.webUrl}/dashboard/settings?calendar=error`);
    }
  });

  fastify.register(async (authed) => {
    authed.addHook("preHandler", requireUser);

    authed.get("/connect", async (request) => {
      return { url: getConnectUrl(request.sessionUser!.id) };
    });

    authed.get("/connections", async (request) => {
      const db = getDb();
      const rows = await db
        .select({
          id: calendarConnections.id,
          provider: calendarConnections.provider,
          email: calendarConnections.email,
          syncEnabled: calendarConnections.syncEnabled,
          lastSyncedAt: calendarConnections.lastSyncedAt,
          createdAt: calendarConnections.createdAt,
        })
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, request.sessionUser!.id));
      return { connections: rows };
    });

    authed.patch("/connections/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = ToggleBody.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "syncEnabled boolean required" });

      const db = getDb();
      const [updated] = await db
        .update(calendarConnections)
        .set({ syncEnabled: body.data.syncEnabled })
        .where(
          and(
            eq(calendarConnections.id, id),
            eq(calendarConnections.userId, request.sessionUser!.id),
          ),
        )
        .returning({ id: calendarConnections.id, syncEnabled: calendarConnections.syncEnabled });
      if (!updated) return reply.status(404).send({ error: "Connection not found" });
      return updated;
    });

    authed.delete("/connections/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const db = getDb();
      const deleted = await db
        .delete(calendarConnections)
        .where(
          and(
            eq(calendarConnections.id, id),
            eq(calendarConnections.userId, request.sessionUser!.id),
          ),
        )
        .returning({ id: calendarConnections.id });
      if (deleted.length === 0) return reply.status(404).send({ error: "Connection not found" });
      return { status: "disconnected" };
    });

    authed.post("/sync", async (request) => {
      const db = getDb();
      const connections = await db
        .select()
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, request.sessionUser!.id),
            eq(calendarConnections.syncEnabled, true),
          ),
        );
      let created = 0;
      for (const conn of connections) {
        created += await syncConnection(conn);
      }
      return { synced: connections.length, meetingsCreated: created };
    });
  });
}
