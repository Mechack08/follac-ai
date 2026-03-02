import type { Platform } from "../types/index.js";

/**
 * URL pattern matchers to identify supported platforms.
 * Keep patterns specific to avoid false positives.
 */
export const PLATFORM_URL_PATTERNS: Record<Platform, RegExp> = {
  gmail: /^https:\/\/mail\.google\.com\/.*/,
  "google-docs": /^https:\/\/docs\.google\.com\/document\/.*/,
  linkedin: /^https:\/\/www\.linkedin\.com\/.*/,
  unknown: /.*/,
};

/**
 * Extension configuration constants.
 */
export const EXTENSION_CONFIG = {
  /** Debounce for DOM observation events (ms) */
  DOM_DEBOUNCE_MS: 500,

  /** Minimum confidence to auto-show the overlay */
  MIN_CONFIDENCE_TO_SHOW: 0.5,

  /** How long to wait before re-analyzing context (ms) */
  CONTEXT_REFRESH_INTERVAL_MS: 3000,

  /** Maximum number of proposed actions shown at once */
  MAX_ACTIONS_SHOWN: 3,

  /** Server base URL — override via .env */
  SERVER_BASE_URL: "http://localhost:3001",

  /** Extension popup dimensions */
  OVERLAY_WIDTH_PX: 380,
  OVERLAY_Z_INDEX: 2147483647,
} as const;

/**
 * Chrome extension message channels.
 */
export const MESSAGE_CHANNELS = {
  CONTENT_TO_BACKGROUND: "content-to-background",
  BACKGROUND_TO_CONTENT: "background-to-content",
  POPUP_TO_BACKGROUND: "popup-to-background",
} as const;
