import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { callLLMStructured } from "../services/openai.service.js";
import type { AgentMessage } from "@follac/shared";

// ─── Validation Schemas ───────────────────────────────────────────────────────

const AgentRequestBody = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  ),
  context: z.record(z.unknown()),
  query: z.string().optional(),
  action: z.record(z.unknown()).optional(),
});

/**
 * Agent Routes — /api/agents/*
 *
 * Each agent in @follac/agents package calls one of these endpoints.
 * The endpoint handles the actual LLM call and returns structured JSON.
 *
 * This pattern keeps:
 * - LLM calls server-side (API key never exposed)
 * - Agent logic client-testable (agents only build prompts)
 * - Easy to add caching, logging, or model-switching per agent
 */
export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  // Context Agent
  fastify.post("/context", async (request, reply) => {
    const body = AgentRequestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    try {
      const { result, tokenUsage } = await callLLMStructured({
        messages: body.data.messages as AgentMessage[],
      });
      return { result, tokenUsage };
    } catch (err) {
      fastify.log.error({ err }, "Context agent LLM call failed");
      return reply.status(500).send({ error: "Context agent failed" });
    }
  });

  // Action Agent
  fastify.post("/action", async (request, reply) => {
    const body = AgentRequestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    try {
      // Action agent returns an array — wrap it for callLLMStructured
      const { content, tokenUsage } = await (
        await import("../services/openai.service.js")
      ).callLLM({
        messages: body.data.messages as AgentMessage[],
        jsonMode: true,
      });

      const parsed = JSON.parse(content) as unknown;
      // Handle both { result: [...] } and [...] shapes
      const result = Array.isArray(parsed)
        ? parsed
        : (parsed as Record<string, unknown>)["result"] ?? parsed;

      return { result, tokenUsage };
    } catch (err) {
      fastify.log.error({ err }, "Action agent LLM call failed");
      return reply.status(500).send({ error: "Action agent failed" });
    }
  });

  // Research Agent
  fastify.post("/research", async (request, reply) => {
    const body = AgentRequestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    try {
      const { result, tokenUsage } = await callLLMStructured({
        messages: body.data.messages as AgentMessage[],
      });
      return { result, tokenUsage };
    } catch (err) {
      fastify.log.error({ err }, "Research agent LLM call failed");
      return reply.status(500).send({ error: "Research agent failed" });
    }
  });

  // Execution Agent
  fastify.post("/execution", async (request, reply) => {
    const body = AgentRequestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    try {
      const { result, tokenUsage } = await callLLMStructured<string>({
        messages: body.data.messages as AgentMessage[],
        maxTokens: 4096,
        temperature: 0.5,
        jsonMode: true,
      });
      return { result, tokenUsage };
    } catch (err) {
      fastify.log.error({ err }, "Execution agent LLM call failed");
      const message = err instanceof Error ? err.message : String(err);
      // Surface quota/auth errors clearly instead of a generic message
      if (message.includes("insufficient_quota") || message.includes("429")) {
        return reply.status(402).send({ error: "OpenAI quota exceeded — please add credits at platform.openai.com/settings/billing" });
      }
      if (message.includes("401") || message.includes("invalid_api_key")) {
        return reply.status(401).send({ error: "Invalid OpenAI API key — check OPENAI_API_KEY in apps/server/.env" });
      }
      return reply.status(500).send({ error: `Execution agent failed: ${message}` });
    }
  });
}
