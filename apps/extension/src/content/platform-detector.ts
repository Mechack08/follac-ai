/**
 * Follac AI — PlatformDetector
 *
 * Manages the lifecycle of platform adapters on a given page.
 * Called from the content script whenever the URL changes.
 *
 * Responsibilities:
 * - Detect which adapter is appropriate for the current URL
 * - Call the adapter's detectContext() on a debounced schedule
 * - Emit context updates via the messaging system
 * - Teardown previous adapter before switching
 */

import {
  adapterRegistry,
  GmailAdapter,
  DocsAdapter,
  LinkedInAdapter,
} from "@follac/platform-adapters";
import type { PlatformAdapter } from "@follac/platform-adapters";
import type { ContextObject } from "@follac/shared";
import { EXTENSION_CONFIG, debounce } from "@follac/shared";

// Register all adapters exactly once
adapterRegistry
  .register(new GmailAdapter())
  .register(new DocsAdapter())
  .register(new LinkedInAdapter());

type ContextChangeHandler = (context: ContextObject) => void | Promise<void>;

export class PlatformDetector {
  private currentAdapter: PlatformAdapter | null = null;
  private onContextChange: ContextChangeHandler;
  /** Debounced detector for MutationObserver triggers (DOM content loading) */
  private readonly debouncedDetect: () => void;
  /** Short-delay timer handle for URL-change triggers */
  private urlChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUrl = "";

  constructor(onContextChange: ContextChangeHandler) {
    this.onContextChange = onContextChange;
    this.debouncedDetect = debounce(
      () => void this.runDetection(),
      EXTENSION_CONFIG.DOM_DEBOUNCE_MS,
    );
  }

  /**
   * Initialize detection for the current URL.
   * Called once on load and again on every SPA navigation.
   *
   * URL changes (new email): run detection after a short 80ms delay so Gmail
   * has time to render the email header, but don't wait for DOM to settle.
   *
   * DOM mutations (same URL): use the normal 150ms debounce.
   */
  initialize(url: string): void {
    const adapter = adapterRegistry.resolve(url);

    if (!adapter) {
      console.warn(`[Follac] No adapter found for URL: ${url}`);
      this.teardownCurrent();
      return;
    }

    const urlChanged = url !== this.lastUrl;
    this.lastUrl = url;

    if (this.currentAdapter?.name === adapter.name) {
      if (urlChanged) {
        // Same platform, different URL (e.g. opened another email).
        // Skip the long DOM debounce — detect after a short delay.
        this.scheduleUrlChangeDetection();
      } else {
        // Same URL, DOM mutation — use normal debounce.
        this.debouncedDetect();
      }
      return;
    }

    // New adapter — teardown old one first
    this.teardownCurrent();
    this.currentAdapter = adapter;

    // Observe DOM mutations for in-page content changes (compose windows etc.)
    if ("observe" in adapter && typeof (adapter as GmailAdapter).observe === "function") {
      (adapter as GmailAdapter).observe(this.debouncedDetect);
    }

    console.warn(`[Follac] Initialized adapter: ${adapter.name}`);
    void this.runDetection();
  }

  /**
   * Run detection after URL_CHANGE_DEBOUNCE_MS (80ms).
   * Much faster than waiting for DOM to fully settle (150ms+).
   * A second detection fires later via MutationObserver if content is still loading.
   */
  private scheduleUrlChangeDetection(): void {
    if (this.urlChangeTimer !== null) clearTimeout(this.urlChangeTimer);
    this.urlChangeTimer = setTimeout(() => {
      this.urlChangeTimer = null;
      void this.runDetection();
    }, EXTENSION_CONFIG.URL_CHANGE_DEBOUNCE_MS);
  }

  private async runDetection(): Promise<void> {
    if (!this.currentAdapter) return;

    try {
      const context = await this.currentAdapter.detectContext();
      if (context.confidenceScore >= EXTENSION_CONFIG.MIN_CONFIDENCE_TO_SHOW) {
        // Await so that any async rejection from the callback is caught by this
        // try/catch rather than escaping as an unhandled promise rejection.
        await this.onContextChange(context);
      }
    } catch (err) {
      console.error("[Follac] Context detection failed:", err);
    }
  }

  private teardownCurrent(): void {
    if (this.urlChangeTimer !== null) {
      clearTimeout(this.urlChangeTimer);
      this.urlChangeTimer = null;
    }
    this.currentAdapter?.teardown();
    this.currentAdapter = null;
  }

  destroy(): void {
    this.teardownCurrent();
  }

  getCurrentAdapter(): PlatformAdapter | null {
    return this.currentAdapter;
  }
}
