/**
 * Follac AI — Background Service Worker
 *
 * Responsibilities:
 * 1. Listen for context updates from content scripts
 * 2. Store the latest context per tab in chrome.storage.session
 * 3. Forward messages between content scripts and popup
 * 4. Manage extension lifecycle events (install, update)
 * 5. Handle the action badge / icon state
 *
 * NOTE: Service workers in MV3 are ephemeral. Never store state in
 * module-level variables without persisting to chrome.storage.
 */

import type { ExtensionMessage, ContextObject, ProposedAction } from "@follac/shared";

const SERVER_BASE = "http://localhost:3001";

// ─── Lifecycle ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.warn("[Follac] Extension installed. Initializing...");
    chrome.storage.local.set({ follac_installed: true, follac_version: "0.1.0" });
  }
  if (details.reason === "update") {
    console.warn("[Follac] Extension updated to", chrome.runtime.getManifest().version);
  }
});

// ─── Message Routing ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    const tabId = sender.tab?.id;

    switch (message.topic) {
      case "context:detected":
      case "context:changed":
        handleContextUpdate(message.payload as ContextObject, tabId);
        sendResponse({ ok: true });
        break;

      case "action:proposed":
        handleActionProposed(message.payload as ProposedAction[], tabId);
        sendResponse({ ok: true });
        break;

      case "action:approved":
        // Forward approval back to the content script that owns this tab
        if (tabId) {
          forwardToContentScript(tabId, message);
        }
        sendResponse({ ok: true });
        break;

      // ── Proxy: content scripts cannot fetch localhost due to Gmail/Docs CSP ──
      case "fetch:orchestrate":
        proxyFetch(`${SERVER_BASE}/api/orchestrate`, message.payload)
          .then((data) => sendResponse({ ok: true, data }))
          .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
        return true; // keep channel open for async

      case "fetch:execute":
        proxyFetch(`${SERVER_BASE}/api/execute`, message.payload)
          .then((data) => sendResponse({ ok: true, data }))
          .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
        return true; // keep channel open for async

      default:
        sendResponse({ ok: false, error: "Unknown topic" });
    }

    // Return true to keep message channel open for async responses
    return true;
  },
);

// ─── Tab Lifecycle ────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
  // Reset context when navigating to a new URL
  if (changeInfo.status === "loading" && changeInfo.url) {
    clearTabContext(tabId);
    updateBadge(tabId, "");
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabContext(tabId);
});

// ─── Handler Implementations ──────────────────────────────────────────────────

async function handleContextUpdate(context: ContextObject, tabId?: number): Promise<void> {
  if (!tabId) return;

  // Persist context per tab
  await chrome.storage.session.set({
    [`follac_context_${tabId}`]: context,
  });

  // Update icon badge with confidence
  const pct = Math.round(context.confidenceScore * 100);
  updateBadge(tabId, `${pct}`);

  // Update badge color based on platform
  const colors: Record<string, string> = {
    gmail: "#EA4335",
    "google-docs": "#4285F4",
    linkedin: "#0A66C2",
    unknown: "#888888",
  };
  chrome.action.setBadgeBackgroundColor({
    color: colors[context.platform] ?? "#3558FC",
    tabId,
  });
}

async function handleActionProposed(actions: ProposedAction[], tabId?: number): Promise<void> {
  if (!tabId) return;
  await chrome.storage.session.set({
    [`follac_actions_${tabId}`]: actions,
  });
}

async function forwardToContentScript(tabId: number, message: ExtensionMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    console.warn(`[Follac SW] Could not forward message to tab ${tabId}`);
  }
}

function clearTabContext(tabId: number): void {
  chrome.storage.session.remove([
    `follac_context_${tabId}`,
    `follac_actions_${tabId}`,
  ]);
}

function updateBadge(tabId: number, text: string): void {
  chrome.action.setBadgeText({ text, tabId });
}

// ─── Proxy Fetch Helper ───────────────────────────────────────────────────────
// Service worker bypasses page CSP (Gmail / Docs block fetch to localhost).

async function proxyFetch(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    // Extract the error.message field from JSON, or fall back to status text
    const errJson = await response.json().catch(() => null) as { error?: string } | null;
    const msg = errJson?.error ?? `Server error ${response.status}`;
    throw new Error(msg);
  }
  return response.json();
}
