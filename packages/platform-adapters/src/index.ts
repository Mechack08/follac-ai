/**
 * @follac/platform-adapters
 *
 * Re-exports all adapters and the registry.
 * Import from "@follac/platform-adapters" everywhere.
 */

export type { PlatformAdapter } from "./base.adapter.js";
export { BaseAdapter } from "./base.adapter.js";
export { AdapterRegistry, adapterRegistry } from "./registry.js";
export { GmailAdapter } from "./gmail/gmail.adapter.js";
export { DocsAdapter } from "./docs/docs.adapter.js";
export { LinkedInAdapter } from "./linkedin/linkedin.adapter.js";
