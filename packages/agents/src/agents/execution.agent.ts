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

      "extract-tasks": `Extract all action items, tasks, decisions, and follow-ups.

For Google Docs (context.platform === "google-docs"):
  CASE A — action.payload.bodyText has content:
    Scan it for TODOs, assignments, decisions, and language like "will", "should",
    "need to", "action:", deadlines, owner names. Return a JSON array (may be []).
  CASE B — bodyText is null/empty (canvas mode; text not accessible):
    Return this exact message as the result string (NOT a JSON array):
    "⚠ Document text not accessible in canvas mode.

To read this document's content, try either:

**Option 1 — Quick:** Press **⌘A** (Mac) or **Ctrl+A** (Windows) to select all text, then click **Run** again.

**Option 2 — Permanent:** In Google Docs open **Tools → Accessibility settings** → turn on **Screen reader support** → then click Run again. This enables full document access for all future Follac features."

For Gmail (context.platform === "gmail"):
  Focus on explicit requests, questions needing answers, and commitments made in the thread.
  Return a JSON array.

JSON array format (when content is available):
[{ "task": "description", "owner": "person name or 'Me' or null", "dueDate": "date or null", "priority": "high|medium|low" }]
Return: { "result": "[JSON array as string]" }`,

      "draft-email-compose": `Improve and refine the email draft.
Fix grammar, improve clarity, and enhance professional tone.
Keep the same intent and main message.
Return: { "result": "<refined email as plain text>" }`,

      "summarize-document": `Provide a structured summary of the document.
Available data (check action.payload):
  - documentTitle — the document title (string or null)
  - bodyText      — full body text (string or null; null means Docs canvas mode is active)
  - headings      — array of section headings (may be empty)

CASE A — bodyText has content (length > 0):
  Write a thorough, detailed summary. Include all major topics, arguments, data points, decisions.
  Format:
  **Overview:**
  <2–3 sentence paragraph covering what the document is, its purpose, and audience>

  **Key Sections:**
  • <Section heading or inferred section>: <detailed description of what it covers, key points, data>
  • (one bullet per major section — be specific, not generic)

  **Takeaways:**
  • <specific conclusion, decision, or insight>
  • (2–4 bullets — draw concrete takeaways, not platitudes)

CASE B — bodyText is null/empty but headings has items:
  Summarise each heading in depth. Explain what each section likely contains and why it matters.
  Same format as CASE A but based on headings.

CASE C — bodyText is null/empty AND headings is empty but documentTitle exists:
  Write a useful analytical summary clearly labelled as title-based. DO NOT output empty sections.
  Format:
  **Based on title: "${action.payload.documentTitle}"**

  **What this document likely covers:**
  <Detailed 2–3 paragraph analysis of what a professional document with this exact title would typically address, the key concepts involved, likely audience, and scope>

  **Probable key topics:**
  • <topic 1 with explanation>
  • <topic 2 with explanation>
  • <topic 3 with explanation>
  (3–5 specific, well-explained bullets derived from the title's subject matter)

  **To get a full content-based summary:**
  Press **⌘A** (Mac) / **Ctrl+A** (Windows) to select all document text, then click Run again. Or enable **Tools → Accessibility settings → Screen reader support** in Google Docs for automatic access.

CASE D — nothing available (no title, no body, no headings):
  Return: "⚠ No document content found. Please open a Google Doc and try again."

Return: { "result": "<markdown output>" }`,

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
