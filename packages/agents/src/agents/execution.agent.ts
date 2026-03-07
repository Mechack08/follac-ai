import { BaseAgent } from "../base.agent.js";
import type { AgentMessage, AgentRequest, AgentResponse, ContextObject, ExecutionResult, ProposedAction } from "@follac/shared";
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

  /**
   * Build the message array for an execution LLM call.
   *
   * Exposed so the server's /api/execute route can call OpenAI directly
   * without an HTTP round-trip back to /api/agents/execution.
   * buildMessages() → callLLMStructured() replaces the old
   * callServer("/api/agents/execution") path, saving one full HTTP hop.
   */
  public buildMessages(action: ProposedAction, context: ContextObject): AgentMessage[] {
    return [
      this.buildSystemMessage(context),
      { role: "user" as const, content: this.buildPrompt(action, context) },
    ];
  }

  private buildPrompt(action: ProposedAction, context: object): string {
    // Trim long text fields in the payload — adapters can provide up to 10k chars
    // of body text, but the LLM gets no value from the tail of a huge document.
    const trimmedAction = this.trimActionPayload(action);
    const actionString = JSON.stringify(trimmedAction, null, 2);

    // Strip extractedData from the context snapshot — the relevant content is
    // already present in trimmedAction.payload above (bodyText, headings, etc.).
    // Including it a second time would double the token cost with identical data.
    const contextMeta = { ...(context as Record<string, unknown>) };
    delete contextMeta["extractedData"];
    const contextString = JSON.stringify(contextMeta, null, 2);

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
  Check action.payload.bodyText, action.payload.headings, and action.payload.documentTitle.

  CASE A — bodyText has content (length > 0):
    Scan it thoroughly for TODOs, assignments, decisions, and language like "will", "should",
    "need to", "action:", deadlines, and owner names. Return a JSON array (may be empty []).

  CASE B — bodyText is null/empty but headings has items:
    Inspect the headings for any action-oriented language (e.g. "TODO", "Action items",
    "Next steps", "Follow-ups"). Extract plausible tasks from headings into a JSON array.
    If no action items can be inferred from headings, return a JSON array [] and also
    set a note field on the result explaining only headings were available.

  CASE C — bodyText is null/empty AND headings is empty (title only or nothing):
    The document text cannot be read in canvas mode.
    Return this exact message as a plain result string (NOT a JSON array):
    "**Action items could not be extracted** — the document body is not readable in standard Google Docs canvas mode.

**To extract action items, choose one option:**

**Option 1 — Quick (one-time):** Press **⌘A** (Mac) or **Ctrl+A** (Windows) to select all text, then click **Run** again.

**Option 2 — Permanent:** Open **Tools → Accessibility settings** → enable **Screen reader support**. This gives Follac full document access automatically on every visit."

For Gmail (context.platform === "gmail"):
  Focus on explicit requests, questions needing answers, and commitments made in the thread.
  Return a JSON array.

JSON array format (when content is available):
[{ "task": "description", "owner": "person name or 'Me' or null", "dueDate": "date or null", "priority": "high|medium|low" }]
Return: { "result": "[JSON array as string]" } when returning tasks, or { "result": "<plain message string>" } for CASE C.`,

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

      "write-section": `Continue writing the document from where it leaves off, or develop the section the user has indicated.
Available data (check action.payload):
  - documentTitle  — the document title
  - bodyText       — the current document content (may be null)
  - headings       — section headings array (may be empty)
  - cursorContext  — the paragraph immediately before the cursor (may be null)
  - instruction    — any specific instruction from the user (may be null)

Guidelines:
  - Match the existing tone, style, and formatting of the document.
  - If bodyText is available, seamlessly continue the content after the last paragraph.
  - If only headings are available, write detailed content for the next logical section.
  - If cursorContext is provided, continue directly from that paragraph.
  - Write 1–3 substantial paragraphs — enough to be useful but not overwhelming.
  - Plain prose only. No meta-commentary like "Here is the next section:". No markdown headers unless the doc already uses them.
  - Return ONLY the text to insert — no preamble, no quotes, no explanation.
Return: { "result": "<text to insert at cursor>" }`,

      "research-person": `Provide a concise professional summary based on available context.
Include: current role, company, background, and potential talking points.
Return: { "result": "<profile summary as markdown>" }`,

      "draft-job-application": `Write a complete, professional job application message ready to be sent directly via LinkedIn Easy Apply or as a cover message.

Available data in action.payload:
  Job:       jobTitle, jobCompany, jobLocation, jobWorkplaceType, jobDescription
  Applicant: applicantName, applicantHeadline, applicantAbout,
             applicantSkills (comma-separated), applicantExperience (array), applicantEducation (array)
  (Applicant fields may be null if the user has not visited their own LinkedIn profile yet.)

Output structure — write exactly in this order, as plain text:

SUBJECT: Application for [jobTitle] — [applicantName or leave blank if null]

Dear [jobCompany] Hiring Team,

[Paragraph 1 — Hook, 2-3 sentences]
Open with one specific, concrete observation from the job description or about the company that shows you read the posting carefully — not generic praise.
Then explain in one sentence why THIS specific role at THIS company is the right next step, linking a detail from the JD.
Forbidden openers: "I am excited", "Having followed", "I am pleased", "I am writing to apply", any sentence starting with "I" as the first word.

[Paragraph 2 — Experience match, 3-4 sentences]
Pick the 1-2 entries from applicantExperience most directly matching the JD requirements.
Name real job titles, companies, technologies, and responsibilities from those entries.
Bridge explicitly: "At [Company], I [did X], which directly addresses your requirement for [Y from JD]."
If applicantExperience is empty, draw from applicantHeadline and applicantAbout instead.

[Paragraph 3 — Skills and differentiator, 2-3 sentences]
Name 3-5 skills from applicantSkills that appear or are strongly implied in the JD.
Add one unique differentiator sourced from applicantAbout or applicantExperience.
If applicantEducation contains a relevant degree, mention it briefly in one clause.

[Paragraph 4 — CTA, 2 sentences]
Express forward-looking confidence — from a position of mutual value, not desperation.
Propose a 20-minute call to explore fit; include the phrase "happy to share more detail".

Best regards,
[applicantName if available, otherwise omit]

Hard rules:
- NEVER write: "I am excited", "team player", "results-driven", "passionate about", "I believe I would be a great fit", "Dear Hiring Manager"
- If applicant fields are null or empty, write entirely from jobDescription — do not invent background
- Every paragraph must include at least one specific name, company, technology, or metric
- Output is plain text — no markdown, no asterisks, no bullet points
- Include the SUBJECT line and sign-off — the user should be able to copy and paste the full message immediately
Return: { "result": "<complete plain-text application message>" }`,

      "research-company": `Produce a structured company research card.
Available data in action.payload: companyName, companyAbout (may be null), companyIndustry (may be null), jobTitle (may be null).
Format exactly as follows:
## [Company Name]
**What they do:** 1-2 sentences on core product/service and market.
**Industry & Scale:** industry, approximate size, key markets.
**Culture signals:** what their messaging suggests about work environment, values, and priorities.
**Why this matters for your application:** 2-3 specific talking points relevant to the role.
**Red flags / things to verify:** questions worth investigating before applying.
Return: { "result": "<markdown company card>" }`,
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

  /**
   * Trim long string fields in action.payload to limit prompt token usage.
   * bodyText beyond 6 000 chars and selectedText beyond 4 000 chars add cost
   * without improving output quality — the LLM only needs the relevant portion.
   */
  private trimActionPayload(action: ProposedAction): ProposedAction {
    const payload = { ...(action.payload as Record<string, unknown>) };
    if (typeof payload["bodyText"] === "string" && payload["bodyText"].length > 6000) {
      payload["bodyText"] = payload["bodyText"].slice(0, 6000) + "\n... [truncated for brevity]";
    }
    if (typeof payload["selectedText"] === "string" && payload["selectedText"].length > 4000) {
      payload["selectedText"] = payload["selectedText"].slice(0, 4000) + "... [truncated]";
    }
    return { ...action, payload } as ProposedAction;
  }
}
