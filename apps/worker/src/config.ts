export const config = {
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  webUrl: process.env["WEB_URL"] ?? "http://localhost:3000",
  deepgram: {
    apiKey: process.env["DEEPGRAM_API_KEY"] ?? "",
    model: process.env["DEEPGRAM_MODEL"] ?? "nova-2",
  },
  openai: {
    apiKey: process.env["OPENAI_API_KEY"] ?? "",
    model: process.env["OPENAI_ANALYSIS_MODEL"] ?? "gpt-4o-mini",
  },
  email: {
    resendApiKey: process.env["RESEND_API_KEY"] ?? "",
    from: process.env["EMAIL_FROM"] ?? "Follac AI <reports@follac.ai>",
  },
} as const;
