import { BaseAgent } from "../base.agent.js";
import type { AgentRequest, AgentResponse, ProposedAction, ContextObject } from "@follac/shared";
import { generateId, now } from "@follac/shared";

export type RankedActions = ProposedAction[];

/**
 * ActionAgent
 *
 * Responsibility: Given a ContextObject (enriched by ContextAgent),
 * generate and rank a list of ProposedActions.
 *
 * The ActionAgent acts as the "recommender" — it knows which actions
 * are available for each platform and uses the LLM to rank them
 * contextually and generate their natural-language descriptions.
 *
 * Outputs are always presented to the user for approval before execution.
 */
export class ActionAgent extends BaseAgent<RankedActions> {
  readonly agentType = "action" as const;
  readonly name = "Action Agent";
  readonly description = "Generates and ranks context-aware action proposals for user approval";

  async run(request: AgentRequest): Promise<AgentResponse<RankedActions>> {
    return this.runSafe(async () => {
      const systemMsg = this.buildSystemMessage(request.context);

      const userMsg = {
        role: "user" as const,
        content: this.buildPrompt(request.context),
      };

      const { data, latencyMs } = await this.callServer<{
        result: RawActionSuggestion[];
        tokenUsage?: AgentResponse["tokenUsage"];
      }>("/api/agents/action", {
        messages: [systemMsg, userMsg],
        context: request.context,
      });

      const actions: ProposedAction[] = data.result.map((raw) => ({
        id: generateId(),
        type: raw.type,
        title: raw.title,
        description: raw.description,
        payload: raw.payload ?? {},
        status: "pending",
        confidence: raw.confidence,
        createdAt: now(),
      }));

      return {
        agentType: this.agentType,
        success: true,
        data: actions,
        error: null,
        tokenUsage: data.tokenUsage,
        latencyMs,
      };
    });
  }

  private buildPrompt(context: ContextObject): string {
    return `
Based on the current user context, suggest up to 3 helpful actions.

Return a JSON array with this shape:

[
  {
    "type": "draft-email | summarize-thread | summarize-document | extract-tasks | compose-linkedin-message | generate-reply | rewrite-paragraph | research-person | custom",
    "title": "Short action title (max 50 chars)",
    "description": "One-sentence explanation shown to the user",
    "confidence": 0.0–1.0,
    "payload": {}
  }
]

Context:
${JSON.stringify(context, null, 2)}

Rules:
- Only suggest actions relevant to the current page and activity
- Rank by confidence (highest first)
- Never suggest more than 3 actions
- payload should include any data needed to execute the action
`.trim();
  }
}

interface RawActionSuggestion {
  type: ProposedAction["type"];
  title: string;
  description: string;
  confidence: number;
  payload: Record<string, unknown>;
}
