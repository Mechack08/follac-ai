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
  private lastSelection = "";

  canHandle(url: string): boolean {
    return /^https:\/\/docs\.google\.com\/document\//.test(url);
  }

  /**
   * Observe:
   *  - Title element changes (document rename)
   *  - Selection polling every 2s — but ONLY fires callback when selection changes.
   *    The editor container is intentionally NOT observed: Google Docs canvas mode
   *    re-renders DOM tiles constantly (cursor blinks, scroll, tile swaps), which
   *    would trigger hundreds of server requests per minute.
   */
  observe(onChangeCallback: () => void): void {
    // Watch title for renames — fires rarely, safe to observe
    const titleEl = document.querySelector(".docs-title-input-label-inner, #docs-title-widget");
    if (titleEl) {
      this.observer = new MutationObserver(onChangeCallback);
      this.observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    // Poll selection every 2s, but ONLY notify when it actually changes.
    // This surfaces the "Rewrite selection" action without hammering the server.
    this.selectionInterval = setInterval(() => {
      const current = this.extractSelectedText() ?? "";
      if (current !== this.lastSelection) {
        this.lastSelection = current;
        onChangeCallback();
      }
    }, 2000);
  }

  override teardown(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.selectionInterval) {
      clearInterval(this.selectionInterval);
      this.selectionInterval = null;
    }
    this.lastSelection = "";
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
      const noBodyHint = !docs.bodyText ? " — tip: press ⌘A to select all text first for best results" : "";

      actions.push({
        id: sid("summarize-document"),
        type: "summarize-document",
        title: "Summarize document",
        description: `Create a structured summary of "${docs.documentTitle ?? "this document"}"${wordInfo}${noBodyHint}`,
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
        description: docs.bodyText
          ? "Find tasks, decisions, and follow-up items in this document"
          : "Find action items — tip: press ⌘A to select all text first for best results",
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

      actions.push({
        id: sid("write-section"),
        type: "write-section",
        title: "Continue writing",
        description: docs.bodyText
          ? "Generate the next section based on the document content"
          : docs.headings.length > 0
          ? "Write content for the next section based on the headings"
          : `Continue drafting "${docs.documentTitle ?? "this document"}"`,
        payload: {
          documentId: docs.documentId,
          documentTitle: docs.documentTitle,
          bodyText: docs.bodyText ? docs.bodyText.slice(-2000) : null, // tail of doc for context
          headings: docs.headings,
          cursorContext: null, // populated in future when cursor position is detectable
          instruction: null,
        },
        status: "pending",
        confidence: 0.75,
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
   * Google Docs renders text to <canvas> tiles in standard mode, so the DOM
   * strategies below work in increasing order of desperation:
   *
   *  1. `.kix-lineview-text-block span`        — span text nodes inside line views (most reliable without Screen Reader)
   *  2. `.kix-paragraphrenderer span`           — span children of paragraph containers (sometimes populated)
   *  3. `.kix-wordhtmlgenerator-word-node`      — word HTML generator nodes
   *  4. `[role="textbox"]`                      — aria layer (Screen Reader mode)
   *  5. Large window.getSelection()             — fallback if user pressed ⌘A to select all
   *
   * Returns null if no accessible text is found.
   */
  private extractBodyText(): string | null {
    // Strategy 1: text-bearing spans inside line views — present in most Docs versions
    const lineSpans = document.querySelectorAll(".kix-lineview-text-block span");
    if (lineSpans.length > 0) {
      const text = Array.from(lineSpans)
        .map((el) => el.textContent ?? "")
        .join("")
        .replace(/\s{3,}/g, "\n")
        .trim();
      if (text.length > 50) return text.slice(0, 10000);
    }

    // Strategy 2: span children of paragraph renderers
    const paraSpans = document.querySelectorAll(".kix-paragraphrenderer span");
    if (paraSpans.length > 0) {
      const text = Array.from(paraSpans)
        .map((el) => el.textContent ?? "")
        .join("")
        .replace(/\s{3,}/g, "\n")
        .trim();
      if (text.length > 50) return text.slice(0, 10000);
    }

    // Strategy 3: word-node spans
    const wordNodes = document.querySelectorAll(".kix-wordhtmlgenerator-word-node");
    if (wordNodes.length > 0) {
      const text = Array.from(wordNodes)
        .map((el) => el.textContent ?? "")
        .join("")
        .trim();
      if (text.length > 50) return text.slice(0, 10000);
    }

    // Strategy 4: aria textbox layer — Screen Reader Support mode.
    // Docs creates one [role="textbox"] per paragraph/tile; we must collect ALL
    // of them, not just the first one (which is often the title field, ~0 chars).
    const textboxes = document.querySelectorAll<HTMLElement>('[role="textbox"]');
    if (textboxes.length > 0) {
      const text = Array.from(textboxes)
        .map((el) => el.textContent ?? "")
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (text.length > 10) return text.slice(0, 10000);
    }

    // Strategy 4b: accessibility manager container (Google Docs internal layer)
    const a11yContainer = document.querySelector<HTMLElement>(
      ".kix-accessibilitymanager-container, [aria-label*='Document content' i], [aria-label*='Body' i][contenteditable]",
    );
    if (a11yContainer?.textContent?.trim() && a11yContainer.textContent.trim().length > 10) {
      return a11yContainer.textContent.trim().slice(0, 10000);
    }

    // Strategy 5: use window.getSelection() if user selected a large portion (⌘A).
    // Only activates for whole-document-scale selections (>2000 chars) to avoid
    // misidentifying a short paragraph selection as the document body.
    const selection = window.getSelection();
    const selText = selection?.toString().trim() ?? "";
    if (selText.length > 2000) {
      return selText.slice(0, 10000);
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
