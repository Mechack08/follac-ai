import type { PlatformAdapter } from "./base.adapter.js";

/**
 * AdapterRegistry — Central registry of all platform adapters.
 *
 * Usage:
 *   registry.register(new GmailAdapter());
 *   const adapter = registry.resolve(window.location.href);
 */
export class AdapterRegistry {
  private readonly adapters: PlatformAdapter[] = [];

  register(adapter: PlatformAdapter): this {
    this.adapters.push(adapter);
    return this;
  }

  /**
   * Find the first adapter that can handle the given URL.
   * Returns undefined if none match (unknown platform).
   */
  resolve(url: string): PlatformAdapter | undefined {
    return this.adapters.find((a) => a.canHandle(url));
  }

  /**
   * Returns all registered adapter names. Useful for debugging.
   */
  list(): string[] {
    return this.adapters.map((a) => a.name);
  }
}

/**
 * Singleton registry — populated once at extension init.
 */
export const adapterRegistry = new AdapterRegistry();
