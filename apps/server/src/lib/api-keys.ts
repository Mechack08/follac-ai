/**
 * Public-API key management + authentication.
 *
 * Keys look like "flc_live_<40 hex chars>". Only the SHA-256 hash is stored;
 * the plaintext is returned once at creation.
 */
import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, newId, apiKeys } from "@follac/db";
import { getEntitlements } from "./entitlements.js";

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `flc_live_${randomBytes(20).toString("hex")}`;
  return {
    plaintext,
    hash: createHash("sha256").update(plaintext).digest("hex"),
    prefix: plaintext.slice(0, 13),
  };
}

export async function createApiKey(userId: string, name: string): Promise<{ id: string; key: string; prefix: string }> {
  const db = getDb();
  const { plaintext, hash, prefix } = generateApiKey();
  const id = newId("key");
  await db.insert(apiKeys).values({ id, userId, name, keyHash: hash, prefix });
  return { id, key: plaintext, prefix };
}

// ─── Authentication + per-plan rate limiting ─────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    apiUser: { userId: string; apiKeyId: string } | null;
  }
}

/** requests per minute by plan */
const RATE_LIMITS: Record<string, number> = {
  business: 300,
  pro: 60,
  default: 20,
};

const windows = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(keyId: string, limit: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const win = windows.get(keyId);
  if (!win || win.resetAt < now) {
    windows.set(keyId, { count: 1, resetAt: now + 60_000 });
    return { ok: true, remaining: limit - 1 };
  }
  win.count++;
  return { ok: win.count <= limit, remaining: Math.max(0, limit - win.count) };
}

// Purge stale windows occasionally so the map can't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [key, win] of windows) {
    if (win.resetAt < now) windows.delete(key);
  }
}, 5 * 60_000).unref();

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers["authorization"];
  if (!header?.startsWith("Bearer flc_")) {
    return reply.status(401).send({
      error: "unauthorized",
      message: "Provide an API key: Authorization: Bearer flc_live_...",
    });
  }

  const hash = createHash("sha256").update(header.slice(7)).digest("hex");
  const db = getDb();
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!key) {
    return reply.status(401).send({ error: "unauthorized", message: "Invalid or revoked API key" });
  }

  const entitlements = await getEntitlements(key.userId);
  if (!entitlements.features.apiAccess) {
    return reply.status(403).send({
      error: "plan_required",
      message: "API access requires the Business plan",
    });
  }

  const limit = RATE_LIMITS[entitlements.planId] ?? RATE_LIMITS["default"]!;
  const { ok, remaining } = checkRateLimit(key.id, limit);
  reply.header("x-ratelimit-limit", String(limit));
  reply.header("x-ratelimit-remaining", String(remaining));
  if (!ok) {
    return reply.status(429).send({ error: "rate_limited", message: "Rate limit exceeded" });
  }

  request.apiUser = { userId: key.userId, apiKeyId: key.id };
  // Fire-and-forget bookkeeping
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
}
