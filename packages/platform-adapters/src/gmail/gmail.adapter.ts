import { BaseAdapter } from "../base.adapter.js";
import type { ContextObject, ProposedAction, GmailContext } from "@follac/shared";
import { now } from "@follac/shared";

/**
 * GmailAdapter
 *
 * Handles context detection and action proposals for Gmail.
 * Gmail is a Single Page App — we use MutationObserver to track
 * URL hash changes and DOM mutations for compose windows.
 *
 * Supported page types:
 *   - inbox        → /mail/u/0/#inbox
 *   - email-thread → /mail/u/0/#inbox/<threadId>
 *   - email-compose → compose overlay is open
 */
export class GmailAdapter extends BaseAdapter {
  readonly name = "Gmail";

  private observer: MutationObserver | null = null;
  private onChangeCallback: (() => void) | null = null;

  canHandle(url: string): boolean {
    return /^https:\/\/mail\.google\.com\//.test(url);
  }

  /**
   * Attach a MutationObserver to detect DOM changes (e.g. compose window opens).
   * Calls onChangeCallback when relevant changes occur.
   */
  observe(onChangeCallback: () => void): void {
    this.onChangeCallback = onChangeCallback;
    const target = document.body;
    if (!target) return;

    this.observer = new MutationObserver(() => {
      this.onChangeCallback?.();
    });

    this.observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }

  override teardown(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.onChangeCallback = null;
  }

  async extractData(): Promise<Record<string, unknown>> {
    const gmail: GmailContext = {
      threadId: this.extractThreadId(),
      subject: this.extractSubject(),
      senderName: this.extractSenderName(),
      senderEmail: this.extractSenderEmail(),
      recipientEmails: this.extractRecipientEmails(),
      bodyPreview: this.extractBodyPreview(),
      isComposing: this.isComposeWindowOpen(),
      composeDraft: this.extractComposeDraft(),
      labelIds: this.extractLabelIds(),
      messageCount: this.extractMessageCount(),
    };
    return gmail as unknown as Record<string, unknown>;
  }

  async detectContext(): Promise<ContextObject> {
    const data = await this.extractData();
    const gmail = data as unknown as GmailContext;
    const pageType = this.classifyPageType(gmail);

    const detectedActivity = this.describeActivity(gmail, pageType);
    const inferredIntent = this.inferIntent(gmail, pageType);
    const confidence = this.scoreConfidence(gmail, pageType);

    return {
      platform: "gmail",
      pageType,
      detectedActivity,
      inferredIntent,
      confidenceScore: confidence,
      extractedData: data,
      capturedAt: now(),
    };
  }

  async proposeActions(context: ContextObject): Promise<ProposedAction[]> {
    const gmail = context.extractedData as unknown as GmailContext;
    const actions: ProposedAction[] = [];

    // Stable IDs: keyed to thread/compose content so re-detections produce
    // identical IDs — result events always find their action card even if
    // MutationObserver fires between clicking Run and receiving the result.
    const sid = (type: string) =>
      `gmail-${gmail.threadId ?? context.pageType}-${type}`;

    if (context.pageType === "email-thread" && gmail.subject) {
      actions.push({
        id: sid("summarize-thread"),
        type: "summarize-thread",
        title: "Summarize this thread",
        description: `Get a concise summary of "${gmail.subject}"`,
        payload: { threadId: gmail.threadId, subject: gmail.subject },
        status: "pending",
        confidence: 0.9,
        createdAt: now(),
      });

      actions.push({
        id: sid("generate-reply"),
        type: "generate-reply",
        title: "Draft a reply",
        description: "Generate a contextual reply to this email",
        payload: {
          threadId: gmail.threadId,
          subject: gmail.subject,
          senderEmail: gmail.senderEmail,
          bodyPreview: gmail.bodyPreview,
        },
        status: "pending",
        confidence: 0.85,
        createdAt: now(),
      });

      actions.push({
        id: sid("extract-tasks"),
        type: "extract-tasks",
        title: "Extract action items",
        description: "Pull out tasks and follow-ups from this thread",
        payload: { threadId: gmail.threadId, bodyPreview: gmail.bodyPreview },
        status: "pending",
        confidence: 0.75,
        createdAt: now(),
      });
    }

    if (context.pageType === "email-compose" && gmail.composeDraft) {
      actions.push({
        id: sid("draft-email"),
        type: "draft-email",
        title: "Improve this draft",
        description: "Refine tone, clarity, and structure of your draft",
        payload: { draft: gmail.composeDraft },
        status: "pending",
        confidence: 0.88,
        createdAt: now(),
      });
    }

    // Sort by confidence desc, limit to top 3
    return actions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  // ─── Private DOM Extraction Helpers ─────────────────────────────────────────

  private extractThreadId(): string | null {
    // Modern Gmail uses base64url-encoded IDs (e.g. FMfcgzQfCDRsCKLd...)
    // Old Gmail used lowercase hex. Match both.
    const match = window.location.hash.match(
      /#(?:inbox|sent|spam|trash|starred|all|label\/[^/]+)\/([A-Za-z0-9_+=-]+)/,
    );
    return match?.[1] ?? null;
  }

  private extractSubject(): string | null {
    // Primary: thread subject heading
    const h2 = this.getTextContent("h2.hP");
    if (h2) return h2;
    // Secondary: title attribute on thread anchor
    const titleEl = document.querySelector<HTMLElement>("[email][data-hovercard-id] + span");
    if (titleEl?.textContent) return titleEl.textContent.trim();
    // Tertiary: page title minus " - Gmail"
    const pageTitle = document.title?.replace(/ - Gmail$/i, "").trim();
    return pageTitle || null;
  }

  private extractSenderName(): string | null {
    // Try the sender span in expanded view
    return (
      this.getTextContent(".gD[email]") ||
      this.getTextContent(".go") ||
      this.getAttribute(".iw span[email]", "name") ||
      null
    );
  }

  private extractSenderEmail(): string | null {
    return this.getAttribute(".gD[email]", "email");
  }

  private extractRecipientEmails(): string[] {
    const elements = this.querySelectorAll<HTMLElement>(".g2[email]");
    return elements
      .map((el) => el.getAttribute("email"))
      .filter((e): e is string => e !== null);
  }

  private extractBodyPreview(): string | null {
    // Collect all expanded message bodies in the thread (most complete view)
    const bodies = this.querySelectorAll<HTMLElement>(".a3s.aiL");
    if (!bodies.length) {
      // Fallback: get any visible quoted/preview text
      const preview = this.getTextContent(".y6");
      return preview?.slice(0, 3000) ?? null;
    }

    // Concatenate all messages with separator, newest at bottom (Gmail default order)
    const allText = bodies
      .map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean)
      .join("\n\n--- Next message ---\n\n");

    // Cap at 5000 chars to keep prompts reasonable
    return allText.slice(0, 5000) || null;
  }

  private isComposeWindowOpen(): boolean {
    return (
      this.querySelector(".M9 .compose-form") !== null ||
      this.querySelector(".dw .Am.Al.editable") !== null ||
      this.querySelector("[data-tooltip='Send']") !== null ||
      window.location.hash.includes("compose")
    );
  }

  private extractComposeDraft(): string | null {
    const editor = this.querySelector<HTMLElement>(".Am.Al.editable.LW-avf");
    return editor?.innerText?.trim() ?? null;
  }

  private extractLabelIds(): string[] {
    const hash = window.location.hash;
    const labelMatch = hash.match(/#label\/([^/]+)/);
    if (labelMatch) return [decodeURIComponent(labelMatch[1])];
    if (hash.includes("#inbox")) return ["INBOX"];
    if (hash.includes("#sent")) return ["SENT"];
    if (hash.includes("#spam")) return ["SPAM"];
    return [];
  }

  private extractMessageCount(): number {
    // Gmail shows message count in the thread header e.g. "Re: Subject (3)"
    const countEl = this.querySelector(".Dj") ?? this.querySelector("[data-thread-id] .yX");
    const text = countEl?.textContent?.trim();
    if (text) {
      const match = text.match(/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    // Count expanded message containers as fallback
    const messageContainers = this.querySelectorAll(".gs");
    return messageContainers.length || 1;
  }

  // ─── Context Classification Helpers ─────────────────────────────────────────

  private classifyPageType(gmail: GmailContext) {
    if (gmail.isComposing) return "email-compose" as const;
    if (gmail.threadId) return "email-thread" as const;
    return "inbox" as const;
  }

  private describeActivity(gmail: GmailContext, pageType: string): string {
    if (pageType === "email-compose") {
      return "Composing a new email";
    }
    if (pageType === "email-thread") {
      return `Reading email thread: "${gmail.subject ?? "Unknown Subject"}"`;
    }
    return "Browsing Gmail inbox";
  }

  private inferIntent(gmail: GmailContext, pageType: string): string {
    if (pageType === "email-compose") {
      return gmail.composeDraft
        ? "Drafting an outgoing email"
        : "Starting a new email conversation";
    }
    if (pageType === "email-thread") {
      const hasMultiple = gmail.messageCount > 2;
      return hasMultiple
        ? "Reviewing an ongoing email conversation"
        : "Reading a new incoming email";
    }
    return "Managing email inbox";
  }

  private scoreConfidence(gmail: GmailContext, pageType: string): number {
    if (pageType === "email-compose" && gmail.composeDraft) return 0.92;
    if (pageType === "email-thread" && gmail.subject) return 0.88;
    if (pageType === "email-thread") return 0.7;
    return 0.5;
  }
}
