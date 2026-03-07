import type { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";

/**
 * API key authentication middleware.
 *
 * Protects all /api/* routes from unauthorized use of your OpenAI credits.
 * Skipped automatically when FOLLAC_API_SECRET is not set (dev mode).
 *
 * In production:
 *   - Set FOLLAC_API_SECRET=<random 32-char secret> on the server
 *   - Set the same value as FOLLAC_API_SECRET in the extension build env
 *   - The service worker will attach: Authorization: Bearer <secret>
 *
 * Uses constant-time comparison to prevent timing-based secret leakage.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Skip auth entirely in dev (env var not configured)
  if (!config.apiSecret) return;

  const auth = request.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Unauthorized: missing Authorization header" });
  }

  const token = auth.slice(7);
  if (!constantTimeEqual(token, config.apiSecret)) {
    return reply.status(401).send({ error: "Unauthorized: invalid API key" });
  }
}

/**
 * Constant-time string comparison.
 * Prevents timing attacks that could leak the secret character by character.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
