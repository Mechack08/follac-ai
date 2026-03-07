/**
 * Server configuration — loaded once from environment at startup.
 * All env access goes through this object. Never read process.env directly elsewhere.
 */
export const config = {
  port: parseInt(process.env["PORT"] ?? "3001", 10),
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  logLevel: process.env["LOG_LEVEL"] ?? "info",
  /**
   * Shared secret that protects /api/* routes from unauthorized use.
   * Set FOLLAC_API_SECRET in server .env and the extension build env.
   * Leave empty in development — auth is skipped when not set.
   */
  apiSecret: process.env["FOLLAC_API_SECRET"] ?? "",
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
