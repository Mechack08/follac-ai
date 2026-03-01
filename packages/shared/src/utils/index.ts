import type { Platform } from "../types/index.js";
import { PLATFORM_URL_PATTERNS } from "../constants/index.js";

/**
 * Detect platform from a URL string.
 */
export function detectPlatformFromUrl(url: string): Platform {
  for (const [platform, pattern] of Object.entries(PLATFORM_URL_PATTERNS)) {
    if (platform === "unknown") continue;
    if (pattern.test(url)) return platform as Platform;
  }
  return "unknown";
}

/**
 * Generate a UUID v4 in environments that support crypto.randomUUID.
 * Falls back to a timestamp-based string for compatibility.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Returns the current UTC ISO timestamp.
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Clamps a number between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Truncates a string to maxLength, appending "…" if truncated.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}

/**
 * Creates a debounced version of a function.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
