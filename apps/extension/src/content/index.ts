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
import { EXTENSION_CONFIG, now } from "@follac/shared";
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

    const response = await fetch(`${EXTENSION_CONFIG.SERVER_BASE_URL}/api/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, adapterActions }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json() as {
      proposedActions: ProposedAction[];
    };

    const actions = result.proposedActions;

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
    const response = await fetch(`${EXTENSION_CONFIG.SERVER_BASE_URL}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, context: currentContext }),
    });

    if (!response.ok) throw new Error(`Execution server error: ${response.status}`);

    const result = await response.json() as { output: string };

    // Execute the action in the DOM
    await executionRunner.execute(action, result.output, currentContext);

    // Notify overlay with the result so it can display output or a success message
    document.dispatchEvent(new CustomEvent("follac:result", {
      detail: {
        actionId: action.id,
        output: isDomWrite ? "✓ Applied to editor" : (result.output ?? "Done"),
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
