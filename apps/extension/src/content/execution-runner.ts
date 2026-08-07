/**
 * Follac AI — ExecutionRunner
 *
 * Handles all DOM manipulation after a user approves an action.
 *
 * CRITICAL: All DOM writes happen ONLY after explicit user approval.
 * The ExecutionRunner never modifies the page without a prior approval event.
 *
 * Strategy per action type:
 *  - draft-email / generate-reply → inject text into Gmail compose editor
 *  - rewrite-paragraph            → replace selected text in Docs
 *  - compose-linkedin-message     → inject text into LinkedIn message box
 *  - summarize-* / extract-tasks  → show output in the overlay (no DOM write)
 */

import type { ProposedAction, ContextObject, ActionType } from "@follac/shared";

type DOMWriter = (output: string, context: ContextObject) => Promise<void>;

export class ExecutionRunner {
  private readonly writers: Partial<Record<ActionType, DOMWriter>> = {
    "draft-email": this.openGmailComposeAndWrite.bind(this),
    "generate-reply": this.openGmailReplyAndWrite.bind(this),
    "compose-linkedin-message": this.writeToLinkedInMessageBox.bind(this),
    "rewrite-paragraph": this.replaceSelectedText.bind(this),
    "write-section": this.insertAtCursor.bind(this),
  };

  async execute(
    action: ProposedAction,
    output: string,
    context: ContextObject,
  ): Promise<void> {
    const writer = this.writers[action.type];

    if (writer) {
      await writer(output, context);
    }
    // For summarize/extract actions: output is shown in the overlay,
    // no DOM write needed. The overlay receives output via the custom event.
  }

  // ─── Gmail Compose ──────────────────────────────────────────────────────────

  /** Open a NEW compose window (Draft Email action) and inject text */
  private async openGmailComposeAndWrite(output: string): Promise<void> {
    let editor = document.querySelector<HTMLElement>(".Am.Al.editable.LW-avf");

    if (!editor) {
      // Click the Gmail "Compose" button
      const composeBtn = document.querySelector<HTMLElement>(
        ".T-I.T-I-KE[gh='cm'], .z0 > .L3",
      );
      if (composeBtn) {
        composeBtn.click();
        await this.waitForElement(".Am.Al.editable.LW-avf", 2000);
        editor = document.querySelector<HTMLElement>(".Am.Al.editable.LW-avf");
      }
    }

    await this.injectIntoEditor(editor, output);
  }

  /** Open the REPLY compose window and inject the generated reply */
  private async openGmailReplyAndWrite(output: string): Promise<void> {
    let editor = document.querySelector<HTMLElement>(".Am.Al.editable.LW-avf");

    if (!editor) {
      // Try reply button selectors (Gmail uses multiple depending on layout)
      const replySelectors = [
        "[data-tooltip='Reply']",
        ".ams.bkH",                 // icon reply button in thread
        ".b8.UC span[aria-label*='Reply']",
        "span[aria-label='Reply']", // accessible label fallback
      ];

      let clicked = false;
      for (const sel of replySelectors) {
        const btn = document.querySelector<HTMLElement>(sel);
        if (btn) {
          btn.click();
          clicked = true;
          break;
        }
      }

      if (clicked) {
        await this.waitForElement(".Am.Al.editable.LW-avf", 2000);
        editor = document.querySelector<HTMLElement>(".Am.Al.editable.LW-avf");
      }
    }

    await this.injectIntoEditor(editor, output);
  }

  /** Shared: focus an editor element and set its text content */
  private async injectIntoEditor(editor: HTMLElement | null, output: string): Promise<void> {
    if (!editor) {
      console.warn("[Follac] Gmail compose editor not found");
      return;
    }

    editor.focus();
    editor.innerText = "";

    // Use execCommand for undo-stack compatibility; fall back to innerText assignment
    const inserted = document.execCommand("insertText", false, output);
    if (!inserted) {
      editor.innerText = output;
    }

    // Trigger Gmail's internal change detection
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /** Poll for an element to appear, up to `timeoutMs` */
  private waitForElement(selector: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (document.querySelector(selector)) return resolve();
      const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(); }, timeoutMs);
    });
  }

  // ─── LinkedIn Message Box ──────────────────────────────────────────────────

  private async writeToLinkedInMessageBox(output: string): Promise<void> {
    const editor = document.querySelector<HTMLElement>(
      ".msg-form__contenteditable[contenteditable='true']",
    );
    if (!editor) {
      console.warn("[Follac] LinkedIn message editor not found");
      return;
    }

    editor.focus();
    editor.innerText = output;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ─── Google Docs text insertion ────────────────────────────────────────────

  /**
   * Insert AI-generated text at the current cursor position in Google Docs.
   * Used for write-section (no prior selection needed).
   */
  async insertAtCursor(output: string): Promise<void> {
    // Clicking the modal button removes focus from the Docs editor.
    // We must restore it before execCommand can insert at the cursor.

    // Screen Reader mode: [role="textbox"][contenteditable="true"]
    // Standard mode: the kix editor canvas div (not contenteditable, but still focusable)
    const editor =
      document.querySelector<HTMLElement>('[role="textbox"][contenteditable="true"]') ??
      document.querySelector<HTMLElement>(".kix-appview-editor .docs-texteventtarget-iframe") ??
      document.querySelector<HTMLElement>(".docs-texteventtarget-iframe");

    // For iframe-based editors (standard Docs), focus the iframe's content window
    if (editor?.tagName === "IFRAME") {
      (editor as HTMLIFrameElement).contentWindow?.focus();
    } else {
      editor?.focus();
    }

    // Wait one animation frame so the browser flushes the focus event before execCommand
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const success = document.execCommand("insertText", false, output);
    if (success) return;

    // Fallback: write to clipboard and notify the user via a brief banner
    try {
      await navigator.clipboard.writeText(output);
      this.showInsertFallbackBanner();
    } catch (err) {
      console.warn("[Follac] Clipboard write failed:", err);
    }
  }

  private showInsertFallbackBanner(): void {
    const existing = document.getElementById("follac-insert-banner");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "follac-insert-banner";
    Object.assign(banner.style, {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      background: "#1e293b",
      border: "1px solid #475569",
      borderRadius: "8px",
      padding: "10px 16px",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      color: "#e2e8f0",
      boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      whiteSpace: "nowrap",
    });
    banner.textContent = "📋 Text copied. Click in the document then press ⌘V / Ctrl+V to paste";
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
  }

  private async replaceSelectedText(output: string): Promise<void> {
    // Google Docs uses a canvas-based editor.
    // Attempt 1: execCommand (works in Docs accessible / A11y editing mode)
    const success = document.execCommand("insertText", false, output);

    if (success) {
      console.log("[Follac] Text replaced via execCommand");
      return;
    }

    // Attempt 2: clipboard fallback — copy the rewritten text silently so the
    // user can paste it with Cmd+V to replace the selection manually.
    try {
      await navigator.clipboard.writeText(output);
      console.log("[Follac] Copied rewritten text to clipboard (execCommand unavailable)");
    } catch (err) {
      console.warn("[Follac] Clipboard write failed:", err);
    }
    // Either way the result modal will display the output for manual copy.
  }
}
