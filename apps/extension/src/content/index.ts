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
/** True while an action execution (LLM call + DOM write) is in flight. */
let isExecuting = false;
/**
 * Fingerprint of the last context sent to the server.
 * Prevents duplicate /orchestrate calls when the adapter fires but nothing
 * meaningful changed (e.g. same email thread, same Docs selection).
 */
let lastContextKey = "";
/** Tracks the URL at the time of the last navigate event to deduplicate replaceState no-ops. */
let lastNavigatedUrl = window.location.href;

/**
 * Derive a short stable key from the context's meaningful fields.
 * Includes the current URL so hash-based navigation (Gmail) and
 * path-based navigation (Docs) both auto-invalidate the key without
 * needing an explicit reset event.
 */
function contextKey(context: ContextObject): string {
  const d = (context.extractedData ?? {}) as Record<string, unknown>;
  const url = window.location.href;
  if (context.platform === "gmail") {
    // Compose draft length so improving a draft triggers a re-check;
    // thread ID is encoded in the URL so no need to repeat it.
    const draftLen = String(d.composeDraft ?? "").length;
    return `gmail:${context.pageType}:${url}:${draftLen}`;
  }
  if (context.platform === "google-docs") {
    // Include title and body availability so that when the Docs DOM loads after
    // the first (empty) detection, the key changes and triggers a fresh call.
    const sel = String(d.selectedText ?? "").slice(0, 80);
    const hasTitle = d.documentTitle ? "1" : "0";
    const hasBody = d.bodyText ? "1" : "0";
    return `docs:${context.pageType}:${url}:${hasTitle}:${hasBody}:${sel}`;
  }
  if (context.platform === "linkedin") {
    // Include draft length so message-thread polling triggers re-calls.
    // Include data-presence flags so a 2nd pass (after DOM renders) always
    // produces a different key than the initial empty-DOM pass — same fix
    // as Google Docs' hasTitle/hasBody guards.
    const draftLen = String(d.messageDraft ?? "").length;
    const hasJob = d.jobTitle ? "1" : "0";
    const hasProfile = d.profileName ? "1" : "0";
    const hasCompany = d.companyName ? "1" : "0";
    return `linkedin:${context.pageType}:${url}:${draftLen}:${hasJob}:${hasProfile}:${hasCompany}`;
  }
  return `${context.platform}:${context.pageType}:${url}`;
}

// ─── Start Detection ──────────────────────────────────────────────────────────

platformDetector.initialize(window.location.href);

// ─── SPA Navigation Watcher ───────────────────────────────────────────────────

// Patch history.pushState and history.replaceState to emit a custom event
// for SPA route changes. LinkedIn uses replaceState for some transitions.
const originalPushState = history.pushState.bind(history);
history.pushState = function (...args) {
  originalPushState(...args);
  window.dispatchEvent(new Event("follac:navigate"));
};

const originalReplaceState = history.replaceState.bind(history);
history.replaceState = function (...args) {
  originalReplaceState(...args);
  // Only fire if the URL actually changed (LinkedIn calls replaceState with the same URL
  // to update scroll position — we don't want that to trigger a full re-detection).
  if (window.location.href !== lastNavigatedUrl) {
    window.dispatchEvent(new Event("follac:navigate"));
  }
};

window.addEventListener("popstate", () => {
  window.dispatchEvent(new Event("follac:navigate"));
});

// Gmail navigates via hash changes — these don't trigger pushState or popstate.
window.addEventListener("hashchange", () => {
  window.dispatchEvent(new Event("follac:navigate"));
});

window.addEventListener("follac:navigate", () => {
  lastNavigatedUrl = window.location.href;
  // Signal loading state immediately so the overlay shows a spinner,
  // not stale action cards from the previous page.
  document.dispatchEvent(new CustomEvent("follac:loading"));
  // Reset fingerprint so the new page always triggers a server call.
  lastContextKey = "";
  platformDetector.initialize(window.location.href);
});

// ─── Action Pipeline ──────────────────────────────────────────────────────────

async function requestActions(context: ContextObject): Promise<void> {
  // Never replace action cards while the user is waiting for an execution result.
  if (isProcessing || isExecuting) return;

  isProcessing = true;

  try {
    // Compute key inside try so any unexpected error doesn't silently kill the pipeline.
    // We only commit the key on SUCCESS so errors stay retryable.
    const key = contextKey(context);
    if (key === lastContextKey) return;
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
      // Only lock the key once actions are actually shown — if the result is
      // empty (e.g. DOM not ready on first Docs load), stay retryable so the
      // next poll (title / body loaded) will try again.
      lastContextKey = key;
      sendToBackground({ topic: "action:proposed", payload: actions, timestamp: now() });
      await overlayManager.injectIfNeeded();
      overlayManager.update(context, actions);
      overlayManager.show();
    }
    // No overlayManager.hide() here — the sidebar persists once shown and
    // only closes on explicit user dismissal or page navigation.
    // Hiding on 0 actions would collapse the sidebar mid-execution if the
    // doc poll happens to return empty on a particular cycle.
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Extension context invalidated")) {
      // The extension was reloaded while this tab was open.
      // Show a one-time banner so the user knows to reload the tab.
      showReloadBanner();
    } else {
      console.error("[Follac] Failed to request actions:", err);
    }
  } finally {
    isProcessing = false;
  }
}

/** Show a non-blocking banner asking the user to reload the tab after an extension reload. */
function showReloadBanner(): void {
  if (document.getElementById("follac-reload-banner")) return; // already shown
  const banner = document.createElement("div");
  banner.id = "follac-reload-banner";
  Object.assign(banner.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "2147483647",
    background: "#1e293b",
    border: "1px solid #475569",
    borderRadius: "10px",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    color: "#e2e8f0",
    maxWidth: "320px",
    cursor: "default",
  });
  banner.innerHTML = `
    <span style="font-size:18px;flex-shrink:0">🔄</span>
    <span><strong style="color:#fff">Follac was reloaded</strong> — reload this tab to reconnect.</span>
    <button id="follac-reload-btn" style="margin-left:4px;padding:4px 10px;background:#3b82f6;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer">Reload</button>
    <button id="follac-dismiss-btn" style="background:none;border:none;color:#94a3b8;font-size:16px;cursor:pointer;line-height:1;padding:0 2px">✕</button>
  `;
  document.body.appendChild(banner);
  document.getElementById("follac-reload-btn")?.addEventListener("click", () => location.reload());
  document.getElementById("follac-dismiss-btn")?.addEventListener("click", () => banner.remove());
}

async function handleActionApproved(action: ProposedAction): Promise<void> {
  if (!currentContext) return;

  isExecuting = true;
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
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("Extension context invalidated")) {
      showReloadBanner();
      return;
    }
    const friendlyMsg = errMsg.includes("quota exceeded") || errMsg.includes("402")
      ? "⚠ OpenAI quota exceeded — add credits at platform.openai.com"
      : errMsg.includes("Invalid OpenAI") || errMsg.includes("401")
      ? "⚠ Invalid OpenAI API key — check server .env file"
      : `⚠ Error: ${errMsg.slice(0, 120)}`;
    document.dispatchEvent(new CustomEvent("follac:result", {
      detail: { actionId: action.id, output: friendlyMsg },
    }));
    sendToBackground({ topic: "action:failed", payload: action, timestamp: now() });
  } finally {
    isExecuting = false;
  }
}

function handleActionRejected(actionId: string): void {
  sendToBackground({ topic: "action:rejected", payload: { actionId }, timestamp: now() });
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function sendToBackground(message: ExtensionMessage): void {
  try {
    // chrome.runtime.sendMessage throws *synchronously* when the extension
    // context is invalidated (e.g. after a dev reload). Wrapping in try/catch
    // prevents that from becoming an unhandled promise rejection at call sites
    // that invoke sendToBackground outside their own try/catch blocks.
    chrome.runtime.sendMessage(message).catch(() => {
      // Service worker may be inactive — this is expected
    });
  } catch {
    // Extension context invalidated — the reload banner will be shown by
    // whichever catch block detects the next chrome.runtime call failure.
  }
}

// ─── Modal → content-script event bridge ─────────────────────────────────────

// "Insert into document" button in the write-section modal
document.addEventListener("follac:insert-text", (e: Event) => {
  const { output } = (e as CustomEvent<{ output: string; actionId: string }>).detail;
  void executionRunner.insertAtCursor(output);
});

// "Retry" button in the write-section modal — re-run the same action
document.addEventListener("follac:rerun-action", (e: Event) => {
  const { action } = (e as CustomEvent<{ action: ProposedAction }>).detail;
  void handleActionApproved(action);
});

// Handle messages FROM background or popup
// Wrap in try/catch: if the extension context is already invalidated when
// the content script first loads, addListener throws synchronously.
try {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.topic === "overlay:show") overlayManager.show();
    if (message.topic === "overlay:hide") overlayManager.hide();
  });
} catch {
  // Context invalidated on load — banner will appear when requestActions runs
}
