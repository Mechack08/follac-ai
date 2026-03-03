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

    const instructions: Record<string, string> = {
      "draft-email": `Write a complete, professional email.
Format: Subject line on first line, blank line, then the body.
Use the context to determine appropriate tone (formal/casual).
Include a proper greeting and sign-off.
Return: { "result": "<full email as plain text>" }`,

      "generate-reply": `Write a concise, professional reply to the email thread.
- Match the tone of the conversation (formal if the thread is formal)
- Directly address the points raised in the latest message
- Keep it to 2-4 short paragraphs max
- Include greeting ("Hi [Name],") and sign-off ("Best regards,")
- Plain text only, no markdown
Return: { "result": "<reply text only, no subject line>" }`,

      "summarize-thread": `Summarize this email thread concisely.
Format your response as:
**TL;DR:** One sentence summary.

**Key Points:**
• Point 1
• Point 2
• Point 3 (etc.)

**Action Items:** (if any)
• Item 1

**Sentiment:** [Positive / Neutral / Needs Attention]
Return: { "result": "<markdown-formatted summary>" }`,

      "extract-tasks": `Extract all action items, tasks, and follow-ups.
For Google Docs (context.platform === "google-docs"): read text from action.payload.bodyText.
  - IMPORTANT: If action.payload.bodyText is null or empty AND action.payload.headings is empty,
    return { "result": "⚠ Document content not accessible. In Google Docs, go to **Tools → Accessibility settings** and enable **Screen reader support**, then retry Follac." }
  - Otherwise look for TODOs, assignments, decisions, and language like "will", "should", "need to", "action:", deadlines, etc.
For Gmail (context.platform === "gmail"): focus on explicit requests, questions, and commitments.
Return a JSON array of tasks (may be empty [] if none found):
[{ "task": "description", "owner": "person name or 'Me' or null", "dueDate": "date or null", "priority": "high|medium|low" }]
Return: { "result": "[JSON array as string]" }`,

      "draft-email-compose": `Improve and refine the email draft.
Fix grammar, improve clarity, and enhance professional tone.
Keep the same intent and main message.
Return: { "result": "<refined email as plain text>" }`,

      "summarize-document": `Provide a structured summary of the document.
The document body text is in action.payload.bodyText (may be null if Google Docs canvas is inaccessible)
and section headings are in action.payload.headings (may be empty array).
IMPORTANT: If bodyText is null or empty AND headings is an empty array, return exactly:
{ "result": "⚠ Document content not accessible. In Google Docs, go to **Tools → Accessibility settings** and enable **Screen reader support**, then retry Follac." }
Otherwise format the summary as:
**Overview:** One-paragraph summary of the document's purpose and scope.

**Key Sections:**
• <heading or section title>: <what it covers>
• (one bullet per major section)

**Takeaways:** 2–3 concise conclusions or decisions.
Return: { "result": "<markdown summary>" }`,

      "compose-linkedin-message": `Write a natural, professional LinkedIn message.
Keep it brief (3-5 sentences), personalized, and not salesy.
Focus on genuine connection or a clear, respectful ask.
Return: { "result": "<message text>" }`,

      "rewrite-paragraph": `Rewrite the selected text to be clearer, more concise, and more professional.
The original text is in action.payload.selectedText. Document title (for tonal context) is in action.payload.documentTitle.
Preserve the original meaning exactly. Do not add new facts or remove key points.
Return ONLY the rewritten text — no commentary, no quotes, no explanation.
Return: { "result": "<rewritten text only>" }`,

      "research-person": `Provide a concise professional summary based on available context.
Include: current role, company, background, and potential talking points.
Return: { "result": "<profile summary as markdown>" }`,
    };

    const typeInstruction = instructions[action.type] ??
      `Execute this action and return the result as a string.
Return: { "result": "<output>" }`;

    return `Execute the following approved action.

Action:
${actionString}

Context:
${contextString}

Instructions:
${typeInstruction}
`.trim();
  }
}
