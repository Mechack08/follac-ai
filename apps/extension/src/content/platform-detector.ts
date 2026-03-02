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

type ContextChangeHandler = (context: ContextObject) => void;

export class PlatformDetector {
  private currentAdapter: PlatformAdapter | null = null;
  private onContextChange: ContextChangeHandler;
  private readonly debouncedDetect: () => void;

  constructor(onContextChange: ContextChangeHandler) {
    this.onContextChange = onContextChange;
    this.debouncedDetect = debounce(
      () => void this.runDetection(),
      EXTENSION_CONFIG.DOM_DEBOUNCE_MS,
    );
  }

  /**
   * Initialize detection for the current URL.
   * Should be called once on content script load, and again on SPA navigations.
   */
  initialize(url: string): void {
    const adapter = adapterRegistry.resolve(url);

    if (!adapter) {
      console.warn(`[Follac] No adapter found for URL: ${url}`);
      this.teardownCurrent();
      return;
    }

    if (this.currentAdapter?.name === adapter.name) {
      // Same adapter — just re-run detection
      this.debouncedDetect();
      return;
    }

    // New adapter — teardown old one first
    this.teardownCurrent();
    this.currentAdapter = adapter;

    // Some adapters (Gmail, LinkedIn) support MutationObserver-based change detection
    if ("observe" in adapter && typeof (adapter as GmailAdapter).observe === "function") {
      (adapter as GmailAdapter).observe(this.debouncedDetect);
    }

    console.warn(`[Follac] Initialized adapter: ${adapter.name}`);
    void this.runDetection();
  }

  private async runDetection(): Promise<void> {
    if (!this.currentAdapter) return;

    try {
      const context = await this.currentAdapter.detectContext();
      if (context.confidenceScore >= EXTENSION_CONFIG.MIN_CONFIDENCE_TO_SHOW) {
        this.onContextChange(context);
      }
    } catch (err) {
      console.error("[Follac] Context detection failed:", err);
    }
  }

  private teardownCurrent(): void {
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
