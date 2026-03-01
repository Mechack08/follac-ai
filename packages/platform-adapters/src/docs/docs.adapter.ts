import { BaseAdapter } from "../base.adapter.js";
import type { ContextObject, ProposedAction, DocsContext } from "@follac/shared";
import { generateId, now } from "@follac/shared";

/**
 * DocsAdapter
 *
 * Handles context detection for Google Docs.
 * Google Docs renders content in a canvas-based editor, so traditional
 * DOM text extraction is limited. We layer lightweight heuristics with
 * available meta-tags and accessible elements.
 *
 * Supported page types:
 *   - document (editing or viewing a document)
 */
export class DocsAdapter extends BaseAdapter {
  readonly name = "Google Docs";

  private observer: MutationObserver | null = null;
  private selectionInterval: ReturnType<typeof setInterval> | null = null;

  canHandle(url: string): boolean {
    return /^https:\/\/docs\.google\.com\/document\//.test(url);
  }

  /**
   * Poll for selection changes since Docs uses a canvas editor.
   * Also observe title element for document rename events.
   */
  observe(onChangeCallback: () => void): void {
    // Watch document title changes (rename)
    const titleEl = document.querySelector(".docs-title-input-label-inner");
    if (titleEl) {
      this.observer = new MutationObserver(onChangeCallback);
      this.observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    // Poll selection every 3s (canvas limitation)
    this.selectionInterval = setInterval(onChangeCallback, 3000);
  }

  override teardown(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.selectionInterval) {
      clearInterval(this.selectionInterval);
      this.selectionInterval = null;
    }
  }

  async extractData(): Promise<Record<string, unknown>> {
    const docs: DocsContext = {
      documentId: this.extractDocumentId(),
      documentTitle: this.extractDocumentTitle(),
      selectedText: this.extractSelectedText(),
      cursorParagraph: null, // Canvas-based; not accessible via DOM
      wordCount: this.estimateWordCount(),
      lastEditedBy: this.extractLastEditor(),
      isEditing: this.isInEditMode(),
      shareEmails: this.extractShareEmails(),
    };
    return docs as unknown as Record<string, unknown>;
  }

  async detectContext(): Promise<ContextObject> {
    const data = await this.extractData();
    const docs = data as unknown as DocsContext;

    return {
      platform: "google-docs",
      pageType: "document",
      detectedActivity: docs.documentTitle
        ? `Working on document: "${docs.documentTitle}"`
        : "Working on a Google Doc",
      inferredIntent: this.inferIntent(docs),
      confidenceScore: this.scoreConfidence(docs),
      extractedData: data,
      capturedAt: now(),
    };
  }

  async proposeActions(context: ContextObject): Promise<ProposedAction[]> {
    const docs = context.extractedData as unknown as DocsContext;
    const actions: ProposedAction[] = [];

    if (docs.selectedText && docs.selectedText.length > 30) {
      actions.push({
        id: generateId(),
        type: "rewrite-paragraph",
        title: "Rewrite selected text",
        description: "Improve clarity, tone, and grammar of your selection",
        payload: { selectedText: docs.selectedText },
        status: "pending",
        confidence: 0.92,
        createdAt: now(),
      });
    }

    if (docs.documentTitle) {
      actions.push({
        id: generateId(),
        type: "summarize-document",
        title: "Summarize this document",
        description: `Generate a concise summary of "${docs.documentTitle}"`,
        payload: {
          documentId: docs.documentId,
          documentTitle: docs.documentTitle,
        },
        status: "pending",
        confidence: 0.85,
        createdAt: now(),
      });

      actions.push({
        id: generateId(),
        type: "extract-tasks",
        title: "Extract action items",
        description: "Find tasks, decisions, and follow-ups in the document",
        payload: { documentId: docs.documentId },
        status: "pending",
        confidence: 0.78,
        createdAt: now(),
      });
    }

    return actions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  // ─── Private DOM Extraction Helpers ─────────────────────────────────────────

  private extractDocumentId(): string | null {
    const match = window.location.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)\//);
    return match?.[1] ?? null;
  }

  private extractDocumentTitle(): string | null {
    return (
      this.getTextContent(".docs-title-input-label-inner") ||
      this.getTextContent("#docs-title-widget") ||
      document.title?.replace(" - Google Docs", "").trim() ||
      null
    );
  }

  private extractSelectedText(): string | null {
    // Note: Docs uses a canvas. This only works in some Docs modes.
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    return text && text.length > 0 ? text.slice(0, 2000) : null;
  }

  private estimateWordCount(): number | null {
    const wordCountEl = this.querySelector(".docs-material-menu-item-word-count") ||
      document.querySelector("[data-word-count]");
    if (wordCountEl) {
      const match = wordCountEl.textContent?.match(/[\d,]+/);
      if (match) return parseInt(match[0].replace(",", ""), 10);
    }
    return null;
  }

  private extractLastEditor(): string | null {
    return this.getTextContent(".docs-status-action-last-modified-author");
  }

  private isInEditMode(): boolean {
    const modeSelector = document.querySelector(
      "[data-tooltip='Editing'], .docs-icon-edit",
    );
    return modeSelector !== null;
  }

  private extractShareEmails(): string[] {
    // Only available when sharing dialog is open
    const avatars = this.querySelectorAll<HTMLElement>("[data-email]");
    return avatars
      .map((el) => el.getAttribute("data-email"))
      .filter((e): e is string => e !== null && e.includes("@"));
  }

  private inferIntent(docs: DocsContext): string {
    if (docs.selectedText) return "Editing or refining specific content";
    if (docs.isEditing) return `Drafting or editing "${docs.documentTitle ?? "a document"}"`;
    return `Reviewing "${docs.documentTitle ?? "a document"}"`;
  }

  private scoreConfidence(docs: DocsContext): number {
    if (docs.selectedText) return 0.93;
    if (docs.isEditing && docs.documentTitle) return 0.85;
    if (docs.documentTitle) return 0.7;
    return 0.5;
  }
}
