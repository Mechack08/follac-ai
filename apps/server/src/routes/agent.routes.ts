import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { callLLM, callLLMStructured } from "../services/openai.service.js";
import { ANALYSIS_TASKS, MAX_TOKENS_BY_TYPE, WRITING_TASKS } from "../lib/routing.js";
import { config } from "../config.js";
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
 * - Caching, logging, and model-switching centralised here
 */
export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  // Context Agent — lightweight classification, gpt-4o-mini is fine
  fastify.post("/context", async (request, reply) => {
    const body = AgentRequestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    try {
      const { result, tokenUsage } = await callLLMStructured({
        messages: body.data.messages as AgentMessage[],
        model: config.openai.modelLite,
        maxTokens: 512,
      });
      return { result, tokenUsage };
    } catch (err) {
      fastify.log.error({ err }, "Context agent LLM call failed");
      return reply.status(500).send({ error: "Context agent failed" });
    }
  });

  // Action Agent — proposes action list, gpt-4o-mini is fine
  fastify.post("/action", async (request, reply) => {
    const body = AgentRequestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    try {
      const { content, tokenUsage } = await callLLM({
        messages: body.data.messages as AgentMessage[],
        model: config.openai.modelLite,
        maxTokens: 512,
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

  // Research Agent — person enrichment, analysis quality — gpt-4o-mini + cache
  fastify.post("/research", async (request, reply) => {
    const body = AgentRequestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    try {
      const { result, tokenUsage } = await callLLMStructured({
        messages: body.data.messages as AgentMessage[],
        model: config.openai.modelLite,
        maxTokens: MAX_TOKENS_BY_TYPE["research-person"] ?? 600,
        useCache: true,
      });
      return { result, tokenUsage };
    } catch (err) {
      fastify.log.error({ err }, "Research agent LLM call failed");
      return reply.status(500).send({ error: "Research agent failed" });
    }
  });

  // Execution Agent — model + token budget chosen per action type
  fastify.post("/execution", async (request, reply) => {
    const body = AgentRequestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const actionType =
      (body.data.action?.["type"] as string | undefined) ??
      // action is also embedded inside the first user message for some agents
      (() => {
        try {
          const userMsg = body.data.messages.find((m) => m.role === "user");
          if (!userMsg) return undefined;
          const inner = JSON.parse(userMsg.content) as Record<string, unknown>;
          return inner["type"] as string | undefined;
        } catch {
          return undefined;
        }
      })();

    const isAnalysis = actionType ? ANALYSIS_TASKS.has(actionType) : false;
    const isWriting = actionType ? WRITING_TASKS.has(actionType) : true;

    const model = isWriting ? config.openai.model : config.openai.modelLite;
    const maxTokens = actionType
      ? (MAX_TOKENS_BY_TYPE[actionType] ?? config.openai.maxTokens)
      : config.openai.maxTokens;

    fastify.log.info(
      { actionType, model, maxTokens, useCache: isAnalysis },
      "Execution agent call",
    );

    try {
      const { result, tokenUsage } = await callLLMStructured<string>({
        messages: body.data.messages as AgentMessage[],
        model,
        maxTokens,
        temperature: isWriting ? 0.5 : 0.2,
        jsonMode: true,
        useCache: isAnalysis,
      });
      return { result, tokenUsage };
    } catch (err) {
      fastify.log.error({ err }, "Execution agent LLM call failed");
      const message = err instanceof Error ? err.message : String(err);
      // Surface quota/auth errors clearly instead of a generic message
      if (message.includes("insufficient_quota") || message.includes("429")) {
        return reply.status(402).send({
          error:
            "OpenAI quota exceeded — please add credits at platform.openai.com/settings/billing",
        });
      }
      if (message.includes("401") || message.includes("invalid_api_key")) {
        return reply.status(401).send({
          error: "Invalid OpenAI API key — check OPENAI_API_KEY in apps/server/.env",
        });
      }
      return reply.status(500).send({ error: `Execution agent failed: ${message}` });
    }
  });
}
