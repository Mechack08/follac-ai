/**
 * Mounts the better-auth handler under /api/auth/*.
 * Fastify request → Web Request → better-auth → Web Response → Fastify reply.
 */
import type { FastifyInstance } from "fastify";
import { auth } from "../lib/auth.js";
import { toWebHeaders } from "../lib/session.js";

export async function authRoutes(server: FastifyInstance): Promise<void> {
  server.route({
    method: ["GET", "POST"],
    url: "/*",
    config: {
      // better-auth applies its own rate limiting to auth endpoints
      rateLimit: false,
    },
    handler: async (request, reply) => {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      const webRequest = new Request(url.toString(), {
        method: request.method,
        headers: toWebHeaders(request),
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : request.body
              ? JSON.stringify(request.body)
              : undefined,
      });

      const response = await auth.handler(webRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      const body = await response.text();
      return reply.send(body.length > 0 ? body : undefined);
    },
  });
}
