import type { ContextObject, ProposedAction } from "@follac/shared";

/**
 * PlatformAdapter — The contract every platform must fulfill.
 *
 * New platforms are added by implementing this interface and registering
 * in the AdapterRegistry. No other code needs to change.
 *
 * Lifecycle per page visit:
 *   1. detectContext()   → Is this adapter relevant? What page type?
 *   2. extractData()     → Pull structured data from the DOM / page state
 *   3. proposeActions()  → Given context, what actions make sense?
 */
export interface PlatformAdapter {
  /**
   * Human-readable adapter name for logging and display.
   */
  readonly name: string;

  /**
   * Analyze the current page and return true only if this adapter
   * can meaningfully handle it.
   */
  canHandle(url: string): boolean;

  /**
   * Classify the current page and build the full ContextObject.
   * This is the primary analysis step — it reads the DOM and
   * produces a standardized context snapshot.
   */
  detectContext(): Promise<ContextObject>;

  /**
   * Extract structured, platform-specific data from the page.
   * Called internally by detectContext(); can also be called separately
   * for incremental refresh.
   */
  extractData(): Promise<Record<string, unknown>>;

  /**
   * Given the latest ContextObject, propose ranked actions.
   * Must always return an array (empty if nothing relevant).
   */
  proposeActions(context: ContextObject): Promise<ProposedAction[]>;

  /**
   * Called when the user navigates away or the URL changes.
   * Use to disconnect MutationObservers or other DOM listeners.
   */
  teardown(): void;
}

/**
 * Base class with sensible defaults and shared helpers.
 * Concrete adapters extend this and override as needed.
 */
export abstract class BaseAdapter implements PlatformAdapter {
  abstract readonly name: string;

  abstract canHandle(url: string): boolean;
  abstract detectContext(): Promise<ContextObject>;
  abstract extractData(): Promise<Record<string, unknown>>;
  abstract proposeActions(context: ContextObject): Promise<ProposedAction[]>;

  teardown(): void {
    // Default: no-op. Override when cleanup is needed.
  }

  /**
   * Safely query a DOM element, returning null if missing.
   */
  protected querySelector<T extends Element>(selector: string, root: Element | Document = document): T | null {
    try {
      return root.querySelector<T>(selector);
    } catch {
      return null;
    }
  }

  /**
   * Collect all matching DOM elements as an array.
   */
  protected querySelectorAll<T extends Element>(selector: string, root: Element | Document = document): T[] {
    try {
      return Array.from(root.querySelectorAll<T>(selector));
    } catch {
      return [];
    }
  }

  /**
   * Get text content from an element, trimmed. Returns null if element missing.
   */
  protected getTextContent(selector: string, root?: Element | Document): string | null {
    const el = this.querySelector(selector, root);
    return el?.textContent?.trim() ?? null;
  }

  /**
   * Get an attribute value from an element. Returns null if missing.
   * Overload accepts an optional root scope (same as querySelector).
   */
  protected getAttribute(selector: string, attr: string, root?: Element | Document): string | null {
    const el = this.querySelector(selector, root);
    return el?.getAttribute(attr) ?? null;
  }
}
