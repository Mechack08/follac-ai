import { BaseAgent } from "../base.agent.js";
import type { AgentRequest, AgentResponse, ContextObject } from "@follac/shared";

export interface ContextAnalysis {
  refinedIntent: string;
  taskCategory: string;
  urgencyLevel: "low" | "medium" | "high";
  keyEntities: string[];
  suggestedAgents: string[];
}

/**
 * ContextAgent
 *
 * Responsibility: Deep-analyze the raw ContextObject and produce
 * a structured ContextAnalysis that downstream agents rely on.
 *
 * It enriches the basic context with:
 * - Refined intent (more specific than the adapter's heuristic)
 * - Task category (e.g. "professional communication", "research")
 * - Urgency level
 * - Key entities referenced (names, companies, topics)
 * - Which other agents should run next
 *
 * The ContextAgent runs FIRST in every pipeline invocation.
 */
export class ContextAgent extends BaseAgent<ContextAnalysis> {
  readonly agentType = "context" as const;
  readonly name = "Context Agent";
  readonly description = "Analyzes the current page context to identify user intent and task category";

  async run(request: AgentRequest): Promise<AgentResponse<ContextAnalysis>> {
    return this.runSafe(async () => {
      const systemMsg = this.buildSystemMessage(request.context);

      const userMsg = {
        role: "user" as const,
        content: this.buildPrompt(request.context),
      };

      const { data, latencyMs } = await this.callServer<{
        result: ContextAnalysis;
        tokenUsage?: AgentResponse["tokenUsage"];
      }>("/api/agents/context", {
        messages: [systemMsg, userMsg],
        context: request.context,
      });

      return {
        agentType: this.agentType,
        success: true,
        data: data.result,
        error: null,
        tokenUsage: data.tokenUsage,
        latencyMs,
      };
    });
  }

  private buildPrompt(context: ContextObject): string {
    return `
Analyze the following browser context and return a JSON object with this exact shape:

{
  "refinedIntent": "string — precise description of what the user is trying to accomplish",
  "taskCategory": "string — e.g. 'professional communication', 'job search', 'content editing'",
  "urgencyLevel": "low | medium | high",
  "keyEntities": ["string", ...],
  "suggestedAgents": ["action", "research"]
}

Context snapshot:
${JSON.stringify(context, null, 2)}

Constraints:
- keyEntities: names, companies, email addresses, document titles, or topics mentioned
- suggestedAgents: pick from ["action", "research", "execution"]
- urgencyLevel high = time-sensitive task evident from content
`.trim();
  }
}
