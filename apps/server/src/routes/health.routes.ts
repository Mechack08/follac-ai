import type { FastifyInstance } from "fastify";

/**
 * Health check routes.
 * Used by monitoring systems and deployment readiness checks.
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", async () => ({
    status: "ok",
    service: "follac-ai-server",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  }));

  fastify.get("/ready", async () => ({ ready: true }));
}
