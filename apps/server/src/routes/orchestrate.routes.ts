import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AgentOrchestrator, ExecutionAgent } from "@follac/agents";
import { callLLMStructured } from "../services/openai.service.js";
import { ANALYSIS_TASKS, MAX_TOKENS_BY_TYPE } from "../lib/routing.js";
import { config } from "../config.js";
import type { ContextObject, ProposedAction } from "@follac/shared";

/**
 * Analyze orchestrator — used only for the context→actions fast path
 * (adapterActions provided) or the rare slow path for unknown platforms.
 * NOTE: slow path still has HTTP callbacks internally; this is acceptable
 * since supported platforms (Gmail/Docs/LinkedIn) always use the fast path.
 */
const orchestrator = new AgentOrchestrator(`http://localhost:${config.port}`);

/**
 * Direct execution agent — buildMessages() produces the prompt array.
 * The execute route calls OpenAI directly via callLLMStructured, eliminating
 * the HTTP loopback: /api/execute → /api/agents/execution → /api/execute.
 */
const executionAgent = new ExecutionAgent("__server_direct__");

const OrchestrateBody = z.object({
  context: z.record(z.unknown()),
  adapterActions: z.array(z.record(z.unknown())).optional(),
});

const ExecuteBody = z.object({
  action: z.record(z.unknown()),
  context: z.record(z.unknown()),
});

/**
 * Orchestrate Routes — /api/orchestrate, /api/execute
 *
 * These are the primary endpoints the extension content script calls.
 *
 * POST /api/orchestrate
 *   Input:  { context: ContextObject }
 *   Output: { proposedActions: ProposedAction[], contextAnalysis, research }
 *
 * POST /api/execute
 *   Input:  { action: ProposedAction, context: ContextObject }
 *   Output: { output: string }
 */
export async function orchestrateRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Main orchestration endpoint.
   * Called every time the context changes meaningfully.
   */
  fastify.post("/orchestrate", async (request, reply) => {
    const body = OrchestrateBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body", details: body.error.message });
    }

    const context = body.data.context as unknown as ContextObject;
    const adapterActions = (body.data.adapterActions ?? []) as unknown as ProposedAction[];

    try {
      const result = await orchestrator.analyze(context, adapterActions.length > 0 ? adapterActions : undefined);

      return {
        proposedActions: result.proposedActions,
        contextAnalysis: result.contextAnalysis,
        research: result.research,
        latencyMs: result.totalLatencyMs,
      };
    } catch (err) {
      // Sanitize: never log bodyText or other extracted user content
      fastify.log.error(
        { err: err instanceof Error ? err.message : String(err), platform: context.platform, pageType: context.pageType },
        "Orchestration failed",
      );
      return reply.status(500).send({ error: "Orchestration failed" });
    }
  });

  /**
   * Execution endpoint — direct path, no HTTP loopback.
   *
   * Previously: /api/execute → orchestrator.execute() → executionAgent.run()
   *             → fetch("/api/agents/execution") → callLLMStructured()
   * Now:        /api/execute → executionAgent.buildMessages() → callLLMStructured()
   *
   * Eliminates one full HTTP round-trip and two JSON serialize/deserialize cycles
   * per user action — critical at scale.
   */
  fastify.post("/execute", async (request, reply) => {
    const body = ExecuteBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const action = body.data.action as unknown as ProposedAction;
    const context = body.data.context as unknown as ContextObject;
    const actionType = action.type;
    const isAnalysis = ANALYSIS_TASKS.has(actionType);
    const model = isAnalysis ? config.openai.modelLite : config.openai.model;
    const maxTokens = MAX_TOKENS_BY_TYPE[actionType] ?? config.openai.maxTokens;

    fastify.log.info(
      { actionType, model, maxTokens, useCache: isAnalysis },
      "Direct execution",
    );

    try {
      const startTs = performance.now();
      const messages = executionAgent.buildMessages(action, context);
      const { result, tokenUsage } = await callLLMStructured<string>({
        messages,
        model,
        maxTokens,
        temperature: isAnalysis ? 0.2 : 0.5,
        jsonMode: true,
        useCache: isAnalysis,
      });
      const latencyMs = Math.round(performance.now() - startTs);
      return { output: result, latencyMs, tokenUsage };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Sanitize: log only action type and platform, not user content
      fastify.log.error(
        { err: message, actionType, platform: context.platform },
        "Execution failed",
      );
      if (message.includes("insufficient_quota") || message.includes("429")) {
        return reply.status(402).send({
          error: "OpenAI quota exceeded — add credits at platform.openai.com/settings/billing",
        });
      }
      if (message.includes("401") || message.includes("invalid_api_key")) {
        return reply.status(401).send({
          error: "Invalid OpenAI API key — check OPENAI_API_KEY in .env",
        });
      }
      return reply.status(500).send({ error: `Execution failed: ${message}` });
    }
  });
}
