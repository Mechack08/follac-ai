import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AgentOrchestrator } from "@follac/agents";
import { config } from "../config.js";
import type { ContextObject, ProposedAction } from "@follac/shared";

const orchestrator = new AgentOrchestrator(`http://localhost:${config.port}`);

const OrchestrateBody = z.object({
  context: z.record(z.unknown()),
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

    try {
      const result = await orchestrator.analyze(context);

      return {
        proposedActions: result.proposedActions,
        contextAnalysis: result.contextAnalysis,
        research: result.research,
        latencyMs: result.totalLatencyMs,
      };
    } catch (err) {
      fastify.log.error({ err, context }, "Orchestration failed");
      return reply.status(500).send({ error: "Orchestration failed" });
    }
  });

  /**
   * Execution endpoint.
   * Called after the user approves a proposed action.
   */
  fastify.post("/execute", async (request, reply) => {
    const body = ExecuteBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const action = body.data.action as unknown as ProposedAction;
    const context = body.data.context as unknown as ContextObject;

    try {
      const result = await orchestrator.execute(context, action);

      if (!result.success) {
        return reply.status(500).send({ error: result.error ?? "Execution failed" });
      }

      return { output: result.data, latencyMs: result.latencyMs };
    } catch (err) {
      fastify.log.error({ err, action }, "Execution failed");
      return reply.status(500).send({ error: "Execution failed" });
    }
  });
}
