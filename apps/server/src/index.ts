/**
 * Follac AI — API Server
 *
 * Fastify server powering:
 *  - Auth (better-auth): /api/auth/*
 *  - Meeting assistant: /api/meetings, /api/calendar, /api/settings
 *  - Billing (Stripe): /api/billing, /api/webhooks/stripe
 *  - Bot webhooks (Recall): /api/webhooks/recall
 *  - Admin panel API: /api/admin/*
 *  - Public API: /v1/* (API-key auth)
 *  - Extension AI gateway: /api/orchestrate, /api/execute (session auth)
 */

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import rawBody from "fastify-raw-body";
import { agentRoutes } from "./routes/agent.routes.js";
import { orchestrateRoutes } from "./routes/orchestrate.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { meetingsRoutes } from "./routes/meetings.routes.js";
import { calendarRoutes } from "./routes/calendar.routes.js";
import { billingRoutes } from "./routes/billing.routes.js";
import { settingsRoutes } from "./routes/settings.routes.js";
import { webhooksRoutes } from "./routes/webhooks.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { developerRoutes } from "./routes/developer.routes.js";
import { v1Routes } from "./routes/v1.routes.js";
import { requireUser } from "./lib/session.js";
import { startScheduler } from "./lib/scheduler.js";
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

server.decorateRequest("sessionUser", null);
server.decorateRequest("apiUser", null);

// ─── Security Middleware ──────────────────────────────────────────────────────

await server.register(helmet, {
  contentSecurityPolicy: false, // Extension manages its own CSP
});

await server.register(cors, {
  origin: (origin, cb) => {
    // Chrome extensions are always allowed (production clients)
    if (!origin || origin.startsWith("chrome-extension://")) {
      return cb(null, true);
    }
    // The web app (dashboard + admin)
    if (origin === config.webUrl) {
      return cb(null, true);
    }
    // Localhost only in non-production environments
    if (config.nodeEnv !== "production" && origin.startsWith("http://localhost")) {
      return cb(null, true);
    }
    return cb(new Error("CORS: Origin not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE"],
});

await server.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: "1 minute",
  // Per-IP limit: each client gets their own bucket.
  // Honour X-Forwarded-For set by reverse proxies / load balancers in production.
  keyGenerator: (request) => {
    const forwarded = request.headers["x-forwarded-for"];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]) ??
      request.ip;
    return ip.trim();
  },
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: "Rate limit exceeded. Please wait before sending more requests.",
  }),
});

// Raw body (signature verification) — only on routes with `config.rawBody`
await server.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: "utf8",
  runFirst: true,
});

// ─── Routes ───────────────────────────────────────────────────────────────────

await server.register(healthRoutes, { prefix: "/health" });
await server.register(authRoutes, { prefix: "/api/auth" });
await server.register(webhooksRoutes, { prefix: "/api/webhooks" });

// Extension AI gateway — now session-authenticated (bearer token or cookie)
await server.register(async (authed) => {
  authed.addHook("preHandler", requireUser);
  await authed.register(orchestrateRoutes);
  await authed.register(agentRoutes, { prefix: "/agents" });
}, { prefix: "/api" });

await server.register(meetingsRoutes, { prefix: "/api" });
await server.register(calendarRoutes, { prefix: "/api/calendar" });
await server.register(billingRoutes, { prefix: "/api/billing" });
await server.register(settingsRoutes, { prefix: "/api" });
await server.register(developerRoutes, { prefix: "/api/developer" });
await server.register(adminRoutes, { prefix: "/api/admin" });
await server.register(v1Routes, { prefix: "/v1" });

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  await server.listen({ port: config.port, host: "0.0.0.0" });
  console.warn(`[Follac Server] Listening on http://localhost:${config.port}`);
  if (config.databaseUrl) {
    startScheduler();
  } else {
    console.warn("[Follac Server] Scheduler disabled (no DATABASE_URL)");
  }
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
