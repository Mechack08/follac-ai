import { BaseAdapter } from "../base.adapter.js";
import type { ContextObject, ProposedAction, DocsContext } from "@follac/shared";
import { now } from "@follac/shared";

/**
 * DocsAdapter
 *
 * Handles context detection and action proposals for Google Docs.
 *
 * Google Docs renders content in a canvas-based editor. Text is extracted
 * from three sources in priority order:
 *
 *  1. `.kix-paragraphrenderer` spans   — most reliable, in-viewport text
 *  2. `[role="textbox"]` aria layer    — screen-reader accessible layer
 *  3. `.kix-lineview-text-block` spans — alternative line-based layout
 *
 * Text injection (rewrite-paragraph) is attempted via execCommand('insertText')
 * after programmatically focusing the editor canvas. Falls back to clipboard.
 *
 * Supported page types:
 *   - document              (editing or viewing)
 *   - document-with-selection (text is selected → rewrite action surfaced first)
 */
export class DocsAdapter extends BaseAdapter {
  readonly name = "Google Docs";

  private observer: MutationObserver | null = null;
  private selectionInterval: ReturnType<typeof setInterval> | null = null;

  canHandle(url: string): boolean {
    return /^https:\/\/docs\.google\.com\/document\//.test(url);
  }

  /**
   * Observe:
   *  - Title element changes (document rename)
   *  - Main editor mutations (content edits, paragraph insertion)
   *  - Selection polling every 2s (canvas limitation — no selectionchange event)
   */
  observe(onChangeCallback: () => void): void {
    // Watch title for renames
    const titleEl = document.querySelector(".docs-title-input-label-inner, #docs-title-widget");
    if (titleEl) {
      this.observer = new MutationObserver(onChangeCallback);
      this.observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    // Also watch the editor container for content changes
    const editorEl = document.querySelector(".kix-appview-editor, .docs-texteventtarget-iframe");
    if (editorEl && !this.observer) {
      this.observer = new MutationObserver(onChangeCallback);
      this.observer.observe(editorEl, { childList: true, subtree: true });
    }

    // Poll selection every 2s — canvas doesn't fire selectionchange reliably
    this.selectionInterval = setInterval(onChangeCallback, 2000);
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
    const selectedText = this.extractSelectedText();
    const bodyText = this.extractBodyText();
    const headings = this.extractHeadings();

    const docs: DocsContext = {
      documentId: this.extractDocumentId(),
      documentTitle: this.extractDocumentTitle(),
      selectedText,
      bodyText,
      headings,
      cursorParagraph: null,
      wordCount: this.estimateWordCount(bodyText),
      lastEditedBy: this.extractLastEditor(),
      isEditing: this.isInEditMode(),
      shareEmails: this.extractShareEmails(),
    };
    return docs as unknown as Record<string, unknown>;
  }

  async detectContext(): Promise<ContextObject> {
    const data = await this.extractData();
    const docs = data as unknown as DocsContext;

    const hasSelection = Boolean(docs.selectedText && docs.selectedText.length > 30);
    const pageType = hasSelection ? "document-with-selection" : "document";

    return {
      platform: "google-docs",
      pageType,
      detectedActivity: this.describeActivity(docs),
      inferredIntent: this.inferIntent(docs),
      confidenceScore: this.scoreConfidence(docs),
      extractedData: data,
      capturedAt: now(),
    };
  }

  async proposeActions(context: ContextObject): Promise<ProposedAction[]> {
    const docs = context.extractedData as unknown as DocsContext;
    const actions: ProposedAction[] = [];
    // Stable IDs: keyed to document + action type so re-polls produce the
    // same ID as the action the user already clicked, preventing result IDs
    // from going stale mid-execution.
    const sid = (type: string) =>
      `docs-${docs.documentId ?? "unknown"}-${type}`;

    // ── Selection-based actions (highest priority) ────────────────────────────
    if (docs.selectedText && docs.selectedText.length > 30) {
      actions.push({
        id: sid("rewrite-paragraph"),
        type: "rewrite-paragraph",
        title: "Rewrite selection",
        description: `Improve clarity and tone of the selected ${this.selectionWordCount(docs.selectedText)}-word passage`,
        payload: {
          selectedText: docs.selectedText,
          documentTitle: docs.documentTitle,
        },
        status: "pending",
        confidence: 0.95,
        createdAt: now(),
      });
    }

    // ── Document-level actions ────────────────────────────────────────────────
    if (docs.documentTitle || docs.bodyText) {
      const wordInfo = docs.wordCount ? ` (${docs.wordCount.toLocaleString()} words)` : "";

      actions.push({
        id: sid("summarize-document"),
        type: "summarize-document",
        title: "Summarize document",
        description: `Create a structured summary of "${docs.documentTitle ?? "this document"}"${wordInfo}`,
        payload: {
          documentId: docs.documentId,
          documentTitle: docs.documentTitle,
          bodyText: docs.bodyText,
          headings: docs.headings,
          wordCount: docs.wordCount,
        },
        status: "pending",
        confidence: 0.87,
        createdAt: now(),
      });

      actions.push({
        id: sid("extract-tasks"),
        type: "extract-tasks",
        title: "Extract action items",
        description: "Find tasks, decisions, and follow-up items in this document",
        payload: {
          documentId: docs.documentId,
          documentTitle: docs.documentTitle,
          bodyText: docs.bodyText,
          headings: docs.headings,
        },
        status: "pending",
        confidence: 0.8,
        createdAt: now(),
      });
    }

    return actions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  // ─── Private DOM Extraction ────────────────────────────────────────────────

  private extractDocumentId(): string | null {
    const match = window.location.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)\//);
    return match?.[1] ?? null;
  }

  private extractDocumentTitle(): string | null {
    return (
      this.getTextContent(".docs-title-input-label-inner") ||
      this.getTextContent("#docs-title-widget") ||
      (document.title?.replace(/\s*-\s*Google Docs\s*$/, "").trim() || null)
    );
  }

  private extractSelectedText(): string | null {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    return text && text.length > 0 ? text.slice(0, 3000) : null;
  }

  /**
   * Extract the full document body text from the Docs accessible DOM.
   *
   * Google Docs maintains text in multiple layers:
   *  - `.kix-paragraphrenderer` — primary paragraph container (most reliable)
   *  - `[role="textbox"]`       — aria accessible layer
   *  - `.kix-lineview-text-block` — alternate line-view layout
   *
   * Returns null if no accessible text is found (canvas-only mode).
   */
  private extractBodyText(): string | null {
    // Strategy 1: paragraph renderers (inline text spans inside each paragraph)
    const paragraphRenderers = document.querySelectorAll(".kix-paragraphrenderer");
    if (paragraphRenderers.length > 0) {
      const paragraphs = Array.from(paragraphRenderers)
        .map((el) => el.textContent?.trim() ?? "")
        .filter((t) => t.length > 0);
      if (paragraphs.length > 0) {
        return paragraphs.join("\n").slice(0, 10000);
      }
    }

    // Strategy 2: aria textbox layer
    const textbox = document.querySelector<HTMLElement>('[role="textbox"]');
    if (textbox?.textContent?.trim()) {
      return textbox.textContent.trim().slice(0, 10000);
    }

    // Strategy 3: line-view text blocks
    const lineBlocks = document.querySelectorAll(".kix-lineview-text-block");
    if (lineBlocks.length > 0) {
      const lines = Array.from(lineBlocks)
        .map((el) => el.textContent?.trim() ?? "")
        .filter((t) => t.length > 0);
      if (lines.length > 0) {
        return lines.join("\n").slice(0, 10000);
      }
    }

    // Strategy 4: word-node spans (last resort)
    const workerNodes = document.querySelectorAll(".kix-wordhtmlgenerator-word-node");
    if (workerNodes.length > 0) {
      return Array.from(workerNodes)
        .map((el) => el.textContent ?? "")
        .join("")
        .slice(0, 10000);
    }

    return null;
  }

  /**
   * Extract headings from the document structure.
   * Tries data attributes, then the navigation sidebar (table of contents).
   */
  private extractHeadings(): string[] {
    // Heading elements from data attributes
    const dataHeadings = document.querySelectorAll(
      "[data-heading-id], .kix-paragraphrenderer[data-paragraph-style*='heading']",
    );
    if (dataHeadings.length > 0) {
      return Array.from(dataHeadings)
        .map((el) => el.textContent?.trim() ?? "")
        .filter((t) => t.length > 0 && t.length < 200)
        .slice(0, 20);
    }

    // Fallback: navigation sidebar / table of contents panel
    const tocItems = document.querySelectorAll(".navigation-item-content");
    if (tocItems.length > 0) {
      return Array.from(tocItems)
        .map((el) => el.textContent?.trim() ?? "")
        .filter((t) => t.length > 0)
        .slice(0, 20);
    }

    return [];
  }

  private estimateWordCount(bodyText: string | null): number | null {
    // 1. Try word count from Docs UI tooltip
    const wordCountEl = document.querySelector(
      ".docs-material-menu-item-word-count, [data-word-count]",
    );
    if (wordCountEl) {
      const match = wordCountEl.textContent?.match(/[\d,]+/);
      if (match) return parseInt(match[0].replace(",", ""), 10);
    }

    // 2. Estimate from extracted body text
    if (bodyText) {
      return bodyText.trim().split(/\s+/).filter(Boolean).length;
    }

    return null;
  }

  private extractLastEditor(): string | null {
    return this.getTextContent(".docs-status-action-last-modified-author");
  }

  private isInEditMode(): boolean {
    return Boolean(
      document.querySelector("[data-tooltip='Editing'], .docs-icon-edit, .kix-cursor"),
    );
  }

  private extractShareEmails(): string[] {
    const avatars = this.querySelectorAll<HTMLElement>("[data-email]");
    return avatars
      .map((el) => el.getAttribute("data-email"))
      .filter((e): e is string => e !== null && e.includes("@"));
  }

  private describeActivity(docs: DocsContext): string {
    if (docs.selectedText) {
      const words = this.selectionWordCount(docs.selectedText);
      return `${docs.documentTitle ? `"${docs.documentTitle}"` : "Document"} — ${words} words selected`;
    }
    if (docs.isEditing) return `Editing "${docs.documentTitle ?? "a document"}"`;
    if (docs.documentTitle) return `Reading "${docs.documentTitle}"`;
    return "Working on a Google Doc";
  }

  private inferIntent(docs: DocsContext): string {
    if (docs.selectedText) return "Refining or editing selected content";
    if (docs.isEditing) return `Drafting "${docs.documentTitle ?? "a document"}"`;
    if (docs.wordCount && docs.wordCount > 500) return "Reading or reviewing a long document";
    return `Working on "${docs.documentTitle ?? "a document"}"`;
  }

  private scoreConfidence(docs: DocsContext): number {
    if (docs.selectedText) return 0.95;
    if (docs.isEditing && docs.documentTitle) return 0.88;
    if (docs.documentTitle) return 0.75;
    return 0.55;
  }

  private selectionWordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
}
