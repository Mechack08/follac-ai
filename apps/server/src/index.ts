/**
 * Follac AI — Server Entry Point
 *
 * Fastify HTTP server that acts as the AI inference gateway.
 * The Chrome extension calls this server; this server calls OpenAI.
 *
 * This separation:
 * - Keeps the API key off the client
 * - Allows prompt engineering without shipping extension updates
 * - Enables rate limiting, logging, and caching centrally
 * - Makes the AI layer independently testable
 */

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { agentRoutes } from "./routes/agent.routes.js";
import { orchestrateRoutes } from "./routes/orchestrate.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { config } from "./config.js";

const server = Fastify({
  logger: {
    level: config.logLevel,
    transport:
      config.nodeEnv === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

// ─── Security Middleware ──────────────────────────────────────────────────────

await server.register(helmet, {
  contentSecurityPolicy: false, // Extension manages its own CSP
});

await server.register(cors, {
  origin: (origin, cb) => {
    // Allow Chrome extensions and local dev
    if (!origin || origin.startsWith("chrome-extension://") || origin.startsWith("http://localhost")) {
      cb(null, true);
    } else {
      cb(new Error("CORS: Origin not allowed"), false);
    }
  },
  methods: ["GET", "POST"],
});

await server.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: "1 minute",
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: "Rate limit exceeded. Please wait before sending more requests.",
  }),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

await server.register(healthRoutes, { prefix: "/health" });
await server.register(orchestrateRoutes, { prefix: "/api" });
await server.register(agentRoutes, { prefix: "/api/agents" });

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  await server.listen({ port: config.port, host: "0.0.0.0" });
  console.warn(`[Follac Server] Listening on http://localhost:${config.port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
