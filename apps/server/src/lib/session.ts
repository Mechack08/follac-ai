/**
 * Session helpers — resolve the better-auth session from a Fastify request
 * and expose `requireUser` / `requireAdmin` preHandlers.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { auth } from "./auth.js";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  stripeCustomerId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    sessionUser: SessionUser | null;
  }
}

/** Convert Fastify's raw headers into a Fetch-API Headers object */
export function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

export async function resolveSession(request: FastifyRequest): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: toWebHeaders(request) });
    if (!session?.user) return null;
    const u = session.user as unknown as Record<string, unknown>;
    return {
      id: String(u["id"]),
      email: String(u["email"]),
      name: String(u["name"] ?? ""),
      role: String(u["role"] ?? "user"),
      stripeCustomerId: (u["stripeCustomerId"] as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await resolveSession(request);
  if (!user) {
    return reply.status(401).send({ error: "Unauthorized: sign in required" });
  }
  request.sessionUser = user;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await resolveSession(request);
  if (!user) {
    return reply.status(401).send({ error: "Unauthorized: sign in required" });
  }
  if (user.role !== "admin") {
    return reply.status(403).send({ error: "Forbidden: admin access required" });
  }
  request.sessionUser = user;
}
