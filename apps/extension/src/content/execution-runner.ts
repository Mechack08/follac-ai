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
    "draft-email": this.writeToGmailCompose.bind(this),
    "generate-reply": this.writeToGmailCompose.bind(this),
    "compose-linkedin-message": this.writeToLinkedInMessageBox.bind(this),
    "rewrite-paragraph": this.replaceSelectedText.bind(this),
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

  private async writeToGmailCompose(output: string): Promise<void> {
    const editor = document.querySelector<HTMLElement>(".Am.Al.editable.LW-avf");
    if (!editor) {
      console.warn("[Follac] Gmail compose editor not found");
      return;
    }

    editor.focus();
    editor.innerText = output;

    // Trigger Gmail's internal change detection
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
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

  // ─── Selected Text (Google Docs) ───────────────────────────────────────────

  private async replaceSelectedText(output: string): Promise<void> {
    // Google Docs uses a canvas-based editor. Native execCommand is limited.
    // We use document.execCommand for text replacement in accessible mode.
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      console.warn("[Follac] No text selected for replacement");
      return;
    }

    // Attempt execCommand (works in some Docs accessibility modes)
    const success = document.execCommand("insertText", false, output);

    if (!success) {
      console.warn(
        "[Follac] execCommand failed — Docs may be in canvas mode. " +
          "Showing output in overlay instead.",
      );
      // Fall back: the output will be shown in the overlay panel for manual copy
    }
  }
}
