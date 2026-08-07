/**
 * Developer settings (dashboard-facing, session-authenticated):
 * API keys and outbound webhook endpoints.
 *
 * GET/POST/DELETE /api/developer/keys
 * GET/POST/DELETE /api/developer/webhooks
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, newId, apiKeys, webhookEndpoints } from "@follac/db";
import { requireUser } from "../lib/session.js";
import { createApiKey } from "../lib/api-keys.js";
import { hasFeature } from "../lib/entitlements.js";

const CreateKeyBody = z.object({ name: z.string().min(1).max(60) });
const CreateWebhookBody = z.object({
  url: z.string().url().startsWith("https://"),
  events: z.array(z.enum(["meeting.completed", "report.ready", "meeting.failed"])).min(1),
});

export async function developerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireUser);
  fastify.addHook("preHandler", async (request, reply) => {
    if (!(await hasFeature(request.sessionUser!.id, "apiAccess"))) {
      return reply.status(403).send({ error: "API access requires the Business plan" });
    }
  });

  // ─── API keys ───────────────────────────────────────────────────────────────

  fastify.get("/keys", async (request) => {
    const db = getDb();
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, request.sessionUser!.id));
    return { keys };
  });

  fastify.post("/keys", async (request, reply) => {
    const body = CreateKeyBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Key name required" });
    const created = await createApiKey(request.sessionUser!.id, body.data.name);
    // `key` is shown exactly once — it is never retrievable again
    return reply.status(201).send(created);
  });

  fastify.delete("/keys/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const [revoked] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, request.sessionUser!.id)))
      .returning({ id: apiKeys.id });
    if (!revoked) return reply.status(404).send({ error: "Key not found" });
    return { status: "revoked" };
  });

  // ─── Outbound webhook endpoints ────────────────────────────────────────────

  fastify.get("/webhooks", async (request) => {
    const db = getDb();
    const endpoints = await db
      .select({
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        active: webhookEndpoints.active,
        createdAt: webhookEndpoints.createdAt,
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.userId, request.sessionUser!.id));
    return { endpoints };
  });

  fastify.post("/webhooks", async (request, reply) => {
    const body = CreateWebhookBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "https URL and at least one event required" });
    }
    const db = getDb();
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    const id = newId("wh");
    await db.insert(webhookEndpoints).values({
      id,
      userId: request.sessionUser!.id,
      url: body.data.url,
      events: body.data.events,
      secret,
    });
    // Secret shown once, used to verify HMAC signatures on deliveries
    return reply.status(201).send({ id, secret });
  });

  fastify.delete("/webhooks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const deleted = await db
      .delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, request.sessionUser!.id)))
      .returning({ id: webhookEndpoints.id });
    if (deleted.length === 0) return reply.status(404).send({ error: "Endpoint not found" });
    return { status: "deleted" };
  });
}
