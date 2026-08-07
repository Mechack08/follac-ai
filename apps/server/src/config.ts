/**
 * Server configuration — loaded once from environment at startup.
 * All env access goes through this object. Never read process.env directly elsewhere.
 */
export const config = {
  port: parseInt(process.env["PORT"] ?? "3001", 10),
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  logLevel: process.env["LOG_LEVEL"] ?? "info",

  /** Public URL of this API server (used for OAuth callbacks + auth base) */
  apiUrl: process.env["API_URL"] ?? "http://localhost:3001",
  /** Public URL of the web app (dashboard) */
  webUrl: process.env["WEB_URL"] ?? "http://localhost:3000",

  databaseUrl: process.env["DATABASE_URL"] ?? "",
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",

  auth: {
    /** Session signing secret — required in production */
    secret: process.env["BETTER_AUTH_SECRET"] ?? "dev-only-insecure-secret",
    google: {
      clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
      clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
    },
  },

  /** Google Calendar OAuth (separate consent w/ calendar.readonly scope) */
  calendar: {
    clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
    clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
    /** How many minutes before start the bot is dispatched */
    botLeadMinutes: parseInt(process.env["BOT_LEAD_MINUTES"] ?? "2", 10),
    /** Calendar sync interval (server-side scheduler) */
    syncIntervalMs: parseInt(process.env["CALENDAR_SYNC_INTERVAL_MS"] ?? "300000", 10),
  },

  recall: {
    apiKey: process.env["RECALL_API_KEY"] ?? "",
    /** Region-specific API host, e.g. us-east-1 | eu-central-1 */
    baseUrl: process.env["RECALL_BASE_URL"] ?? "https://us-east-1.recall.ai",
    /** Shared secret Recall includes in webhook requests (svix secret or custom) */
    webhookSecret: process.env["RECALL_WEBHOOK_SECRET"] ?? "",
  },

  stripe: {
    secretKey: process.env["STRIPE_SECRET_KEY"] ?? "",
    webhookSecret: process.env["STRIPE_WEBHOOK_SECRET"] ?? "",
  },

  email: {
    resendApiKey: process.env["RESEND_API_KEY"] ?? "",
    from: process.env["EMAIL_FROM"] ?? "Follac AI <reports@follac.ai>",
  },

  openai: {
    apiKey: process.env["OPENAI_API_KEY"] ?? "",
    /**
     * Heavy model — used only for generation tasks where quality matters:
     * draft-email, generate-reply, rewrite-paragraph, write-section, compose-linkedin-message
     */
    model: process.env["OPENAI_MODEL"] ?? "gpt-4o",
    /**
     * Lite model — used for analysis/read tasks where cost matters:
     * summarize-document, summarize-thread, extract-tasks, research-person,
     * context-analysis, action-selection
     * ~20× cheaper than gpt-4o with equivalent quality for these tasks.
     */
    modelLite: process.env["OPENAI_MODEL_LITE"] ?? "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 1024, // sensible default — routes override per action type
  },
} as const;

if (!config.openai.apiKey) {
  console.warn(
    "[Follac Server] WARNING: OPENAI_API_KEY is not set. " +
      "AI endpoints will fail until configured.",
  );
}
if (!config.databaseUrl) {
  console.warn(
    "[Follac Server] WARNING: DATABASE_URL is not set. " +
      "Auth, meetings, and billing will fail until configured.",
  );
}
