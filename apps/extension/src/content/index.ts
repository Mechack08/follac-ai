/**
 * Follac AI — Content Script Entry Point
 *
 * This is the brain of the extension's page-side interaction.
 *
 * Full Lifecycle:
 *
 *   1. Content script loads → PlatformDetector initializes
 *   2. PlatformDetector finds the right adapter for the current URL
 *   3. Adapter detects context → emits ContextObject
 *   4. ContextController sends context to background service worker
 *   5. ContextController calls the Follac server via AgentOrchestrator
 *   6. Server returns proposed actions
 *   7. OverlayManager renders the actions to the user
 *   8. User approves an action → ExecutionRunner executes it in the DOM
 *
 * SPA Navigation:
 *   Gmail and LinkedIn are SPAs. We watch history.pushState via a custom
 *   event to detect URL changes without a page reload.
 */

import type { ContextObject, ProposedAction, ExtensionMessage } from "@follac/shared";
import { now } from "@follac/shared";
import { PlatformDetector } from "./platform-detector.js";
import { OverlayManager } from "./overlay-manager.js";
import { ExecutionRunner } from "./execution-runner.js";

// ─── Initialization ───────────────────────────────────────────────────────────

const overlayManager = new OverlayManager({
  onActionApproved: (action) => void handleActionApproved(action),
  onActionRejected: (actionId) => handleActionRejected(actionId),
  onDismiss: () => overlayManager.hide(),
});

const executionRunner = new ExecutionRunner();

const platformDetector = new PlatformDetector(async (context: ContextObject) => {
  currentContext = context;

  // 1. Notify background worker
  sendToBackground({ topic: "context:detected", payload: context, timestamp: now() });

  // 2. Request actions from the Follac server
  await requestActions(context);
});

let currentContext: ContextObject | null = null;
let isProcessing = false;

// ─── Start Detection ──────────────────────────────────────────────────────────

platformDetector.initialize(window.location.href);

// ─── SPA Navigation Watcher ───────────────────────────────────────────────────

// Patch history.pushState to emit a custom event for SPA route changes
const originalPushState = history.pushState.bind(history);
history.pushState = function (...args) {
  originalPushState(...args);
  window.dispatchEvent(new Event("follac:navigate"));
};

window.addEventListener("popstate", () => {
  window.dispatchEvent(new Event("follac:navigate"));
});

window.addEventListener("follac:navigate", () => {
  platformDetector.initialize(window.location.href);
});

// ─── Action Pipeline ──────────────────────────────────────────────────────────

async function requestActions(context: ContextObject): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Get deterministic actions from the adapter (fast, no LLM needed for action selection)
    const adapter = platformDetector.getCurrentAdapter();
    const adapterActions = adapter ? await adapter.proposeActions(context) : [];

    // Route through background worker — content scripts can't fetch localhost
    // directly on Gmail/Docs due to the page's Content Security Policy.
    const result = await chrome.runtime.sendMessage({
      topic: "fetch:orchestrate",
      payload: { context, adapterActions },
      timestamp: now(),
    }) as { ok: boolean; data?: { proposedActions: ProposedAction[] }; error?: string };

    if (!result.ok) throw new Error(result.error ?? "Orchestrate failed");

    const actions = result.data?.proposedActions ?? [];

    if (actions.length > 0) {
      sendToBackground({ topic: "action:proposed", payload: actions, timestamp: now() });
      await overlayManager.injectIfNeeded();
      overlayManager.update(context, actions);
      overlayManager.show();
    } else {
      overlayManager.hide();
    }
  } catch (err) {
    console.error("[Follac] Failed to request actions:", err);
  } finally {
    isProcessing = false;
  }
}

async function handleActionApproved(action: ProposedAction): Promise<void> {
  if (!currentContext) return;

  sendToBackground({ topic: "action:approved", payload: action, timestamp: now() });

  // DOM-writing actions: result is applied directly to the page editor
  const isDomWrite = (["draft-email", "generate-reply", "compose-linkedin-message", "rewrite-paragraph"] as string[]).includes(action.type);

  try {
    // Route through background worker to bypass Gmail/Docs CSP
    const result = await chrome.runtime.sendMessage({
      topic: "fetch:execute",
      payload: { action, context: currentContext },
      timestamp: now(),
    }) as { ok: boolean; data?: { output: string }; error?: string };

    if (!result.ok) throw new Error(result.error ?? "Execution failed");

    const output = result.data?.output ?? "";

    // Execute the action in the DOM
    await executionRunner.execute(action, output, currentContext);

    // Notify overlay with the result so it can display output or a success message
    document.dispatchEvent(new CustomEvent("follac:result", {
      detail: {
        actionId: action.id,
        output: isDomWrite ? "✓ Applied to editor" : (output ?? "Done"),
      },
    }));

    sendToBackground({ topic: "action:completed", payload: action, timestamp: now() });
  } catch (err) {
    console.error("[Follac] Action execution failed:", err);
    document.dispatchEvent(new CustomEvent("follac:result", {
      detail: { actionId: action.id, output: "⚠ Error: execution failed" },
    }));
    sendToBackground({ topic: "action:failed", payload: action, timestamp: now() });
  }
}

function handleActionRejected(actionId: string): void {
  sendToBackground({ topic: "action:rejected", payload: { actionId }, timestamp: now() });
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function sendToBackground(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may be inactive — this is expected
  });
}

// Handle messages FROM background or popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.topic === "overlay:show") overlayManager.show();
  if (message.topic === "overlay:hide") overlayManager.hide();
});
