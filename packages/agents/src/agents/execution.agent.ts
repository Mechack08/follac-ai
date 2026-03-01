import { BaseAgent } from "../base.agent.js";
import type { AgentRequest, AgentResponse, ExecutionResult, ProposedAction } from "@follac/shared";
import { now } from "@follac/shared";

export type GeneratedContent = string;

/**
 * ExecutionAgent
 *
 * Responsibility: Given an APPROVED ProposedAction, generate the
 * actual content or instruction set needed to perform it.
 *
 * IMPORTANT: This agent only generates content. Actual DOM manipulation
 * is handled by the content script's ExecutionRunner after the user approves.
 *
 * Examples:
 * - "draft-email"               → returns full email text
 * - "summarize-thread"          → returns summary markdown
 * - "compose-linkedin-message"  → returns message text
 * - "rewrite-paragraph"         → returns rewritten text
 * - "extract-tasks"             → returns JSON task list
 */
export class ExecutionAgent extends BaseAgent<GeneratedContent> {
  readonly agentType = "execution" as const;
  readonly name = "Execution Agent";
  readonly description = "Generates content and output for approved actions";

  async run(request: AgentRequest): Promise<AgentResponse<GeneratedContent>> {
    return this.runSafe(async () => {
      const action = request.metadata?.["approvedAction"] as ProposedAction | undefined;

      if (!action) {
        return {
          agentType: this.agentType,
          success: false,
          data: null,
          error: "No approved action found in metadata",
          latencyMs: 0,
        };
      }

      const systemMsg = this.buildSystemMessage(request.context);

      const userMsg = {
        role: "user" as const,
        content: this.buildPrompt(action, request.context),
      };

      const { data, latencyMs } = await this.callServer<{
        result: GeneratedContent;
        tokenUsage?: AgentResponse["tokenUsage"];
      }>("/api/agents/execution", {
        messages: [systemMsg, userMsg],
        action,
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

  /**
   * Build an ExecutionResult after content generation.
   * Called by the content script after receiving the agent response.
   */
  buildExecutionResult(
    actionId: string,
    content: string | null,
    error: string | null,
  ): ExecutionResult {
    return {
      actionId,
      success: error === null,
      output: content,
      error,
      executedAt: now(),
    };
  }

  private buildPrompt(action: ProposedAction, context: object): string {
    const actionString = JSON.stringify(action, null, 2);
    const contextString = JSON.stringify(context, null, 2);

    return `
Execute the following approved action and return the result as a JSON string.

Action:
${actionString}

Context:
${contextString}

Instructions by action type:
- "draft-email": Return full email (subject + body) as markdown
- "generate-reply": Return reply body as plain text
- "summarize-thread": Return bullet-point summary
- "summarize-document": Return paragraph summary + bullet points
- "extract-tasks": Return JSON array of { task, owner, dueDate }
- "compose-linkedin-message": Return natural, professional message text
- "rewrite-paragraph": Return rewritten version only, no commentary
- "research-person": Return brief profile summary

Return format: { "result": "<generated content as string>" }
`.trim();
  }
}
