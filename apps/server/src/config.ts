/**
 * Server configuration — loaded once from environment at startup.
 * All env access goes through this object. Never read process.env directly elsewhere.
 */
export const config = {
  port: parseInt(process.env["PORT"] ?? "3001", 10),
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  logLevel: process.env["LOG_LEVEL"] ?? "info",
  openai: {
    apiKey: process.env["OPENAI_API_KEY"] ?? "",
    model: process.env["OPENAI_MODEL"] ?? "gpt-4o",
    temperature: 0.3,
    maxTokens: 2048,
  },
} as const;

if (!config.openai.apiKey) {
  console.warn(
    "[Follac Server] WARNING: OPENAI_API_KEY is not set. " +
      "AI endpoints will fail until configured.",
  );
}
