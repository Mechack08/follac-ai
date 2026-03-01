import type {
  AgentMessage,
  AgentRequest,
  AgentResponse,
  AgentType,
  ContextObject,
} from "@follac/shared";

/**
 * IAgent — The contract every agent must fulfill.
 *
 * Agents are loosely coupled. They communicate through the Orchestrator
 * via AgentRequest/AgentResponse envelopes. They do NOT call each other directly.
 *
 * Lifecycle:
 *   1. Orchestrator calls agent.run(request)
 *   2. Agent invokes its LLM prompt (via the server API)
 *   3. Agent returns structured AgentResponse
 *   4. Orchestrator routes the response to the next agent or to the UI
 */
export interface IAgent<TOutput = unknown> {
  readonly agentType: AgentType;
  readonly name: string;
  readonly description: string;

  run(request: AgentRequest): Promise<AgentResponse<TOutput>>;
}

/**
 * BaseAgent — Shared scaffolding for all agents.
 * Handles timing, error wrapping, and system prompt construction.
 */
export abstract class BaseAgent<TOutput = unknown> implements IAgent<TOutput> {
  abstract readonly agentType: AgentType;
  abstract readonly name: string;
  abstract readonly description: string;

  /** The base URL of the Follac server. Injected at construction. */
  protected readonly serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  abstract run(request: AgentRequest): Promise<AgentResponse<TOutput>>;

  /**
   * Call the Follac server's /api/agents endpoint.
   * All network I/O goes through this single method — swap the transport here.
   */
  protected async callServer<T>(
    endpoint: string,
    body: object,
  ): Promise<{ data: T; latencyMs: number }> {
    const start = performance.now();

    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      throw new Error(`Agent server error [${response.status}]: ${text}`);
    }

    const data = (await response.json()) as T;
    return { data, latencyMs };
  }

  /**
   * Wrap any agent run with error handling to ensure we always return
   * a typed AgentResponse rather than throwing.
   */
  protected async runSafe(
    fn: () => Promise<AgentResponse<TOutput>>,
  ): Promise<AgentResponse<TOutput>> {
    const start = performance.now();
    try {
      return await fn();
    } catch (err) {
      return {
        agentType: this.agentType,
        success: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Math.round(performance.now() - start),
      };
    }
  }

  /**
   * Build a system message that includes the context snapshot.
   * All agents get this as the first message in their conversation.
   */
  protected buildSystemMessage(context: ContextObject): AgentMessage {
    return {
      role: "system",
      content: `You are an AI assistant embedded in a browser extension called Follac AI.

Current user context:
- Platform: ${context.platform}
- Page type: ${context.pageType}
- Activity: ${context.detectedActivity}
- Inferred intent: ${context.inferredIntent}
- Confidence: ${(context.confidenceScore * 100).toFixed(0)}%
- Captured at: ${context.capturedAt}

You must respond with valid JSON only. No markdown, no prose.
Be concise, actionable, and context-aware.`.trim(),
    };
  }
}
