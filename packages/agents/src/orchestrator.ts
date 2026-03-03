import type { AgentRequest, AgentResponse, ContextObject, ProposedAction } from "@follac/shared";
import { ContextAgent, type ContextAnalysis } from "./agents/context.agent.js";
import { ActionAgent } from "./agents/action.agent.js";
import { ResearchAgent, type ResearchResult } from "./agents/research.agent.js";
import { ExecutionAgent } from "./agents/execution.agent.js";

export interface OrchestratorResult {
  contextAnalysis: ContextAnalysis | null;
  proposedActions: ProposedAction[];
  research: ResearchResult | null;
  totalLatencyMs: number;
}

/**
 * AgentOrchestrator
 *
 * The central coordinator of all agents. The extension content script
 * calls ONLY the orchestrator — it does not call individual agents.
 *
 * Default pipeline (context detection → actions):
 *   1. ContextAgent.run()   — deep intent analysis
 *   2. ActionAgent.run()    — generate ranked actions
 *   3. ResearchAgent.run()  — (optional, if context warrants it)
 *
 * Execution pipeline (user approved an action):
 *   1. ExecutionAgent.run() — generate content for the approved action
 *
 * Agents are loosely coupled — the orchestrator wires them together.
 * New pipeline steps can be added here without touching agent code.
 */
export class AgentOrchestrator {
  private readonly contextAgent: ContextAgent;
  private readonly actionAgent: ActionAgent;
  private readonly researchAgent: ResearchAgent;
  private readonly executionAgent: ExecutionAgent;

  constructor(serverUrl: string) {
    this.contextAgent = new ContextAgent(serverUrl);
    this.actionAgent = new ActionAgent(serverUrl);
    this.researchAgent = new ResearchAgent(serverUrl);
    this.executionAgent = new ExecutionAgent(serverUrl);
  }

  /**
   * Run the full context → actions pipeline.
   *
   * Fast path (adapterActions provided):
   *   The client-side adapter already proposed deterministic actions. We skip
   *   BOTH the ContextAgent and ActionAgent LLM calls — they add latency and
   *   token cost but their output (contextAnalysis) is not used by the extension
   *   for rendering action cards. Only ResearchAgent runs (LinkedIn only).
   *
   * Slow path (no adapterActions):
   *   Run ContextAgent → ActionAgent (parallel with ResearchAgent if needed).
   *   Used for platforms without a registered adapter.
   */
  async analyze(context: ContextObject, adapterActions?: ProposedAction[]): Promise<OrchestratorResult> {
    const pipelineStart = performance.now();

    // ── Fast path: adapter actions already determined client-side ─────────────
    if (adapterActions && adapterActions.length > 0) {
      const researchNeeded = this.shouldRunResearch(context);
      const researchResponse = researchNeeded
        ? await this.researchAgent.run({ agentType: "research", context })
        : null;
      return {
        contextAnalysis: null,
        proposedActions: adapterActions,
        research: researchResponse?.data ?? null,
        totalLatencyMs: Math.round(performance.now() - pipelineStart),
      };
    }

    // ── Slow path: no adapter actions — run full LLM pipeline ─────────────────
    const baseRequest: AgentRequest = { agentType: "context", context };
    const contextResponse = await this.contextAgent.run(baseRequest);
    const contextAnalysis = contextResponse.data;

    const researchNeeded = this.shouldRunResearch(context);
    const [actionResponse, researchResponse] = await Promise.all([
      this.actionAgent.run({ agentType: "action", context }),
      researchNeeded
        ? this.researchAgent.run({ agentType: "research", context })
        : Promise.resolve(null),
    ]);

    return {
      contextAnalysis,
      proposedActions: actionResponse.data ?? [],
      research: researchResponse?.data ?? null,
      totalLatencyMs: Math.round(performance.now() - pipelineStart),
    };
  }

  /**
   * Execute a single user-approved action.
   * Returns the generated content string.
   */
  async execute(
    context: ContextObject,
    approvedAction: ProposedAction,
  ): Promise<AgentResponse<string>> {
    const request: AgentRequest = {
      agentType: "execution",
      context,
      metadata: { approvedAction },
    };
    return this.executionAgent.run(request);
  }

  /**
   * Heuristic: run research only when the context contains a person or company
   * entity worth looking up.
   */
  private shouldRunResearch(context: ContextObject): boolean {
    if (context.platform === "linkedin") {
      const li = context.extractedData as Record<string, unknown>;
      return !!(li["profileName"] || li["jobCompany"]);
    }
    return false;
  }
}
