/**
 * @follac/memory — Placeholder Architecture (Phase 5)
 *
 * ⚠️ NOT YET IMPLEMENTED
 *
 * This package defines the interfaces and contracts for the Follac AI
 * memory system. Implementation begins in Phase 5.
 *
 * Planned capabilities:
 *
 * 1. UserPreferenceStore
 *    - Preferred email tone (formal, casual, direct)
 *    - Preferred summary length
 *    - Platform-specific preferences
 *    - Storage: chrome.storage.local (extension-side)
 *
 * 2. ActionHistoryStore
 *    - Record of past approved actions
 *    - Used to personalize future suggestions
 *    - Storage: chrome.storage.local + optional cloud sync
 *
 * 3. LearningPatternEngine
 *    - Tracks which action types the user approves vs rejects
 *    - Adjusts confidence scores over time
 *    - Storage: server-side per user ID
 *
 * 4. ContextCache
 *    - Short-lived cache of recent ContextObjects per tab
 *    - Avoids unnecessary re-inference on minor DOM changes
 *    - Storage: chrome.storage.session (ephemeral)
 */

import type { UserMemory, Platform } from "@follac/shared";

/**
 * IMemoryStore — Interface all memory backends must implement.
 * Concrete implementations: ChromeLocalMemoryStore, RemoteMemoryStore
 */
export interface IMemoryStore {
  save(memory: Partial<UserMemory>): Promise<void>;
  load(userId: string, platform: Platform): Promise<UserMemory | null>;
  clear(userId: string): Promise<void>;
}

/**
 * NoOpMemoryStore — Safe placeholder that does nothing.
 * Used until the real implementation is ready.
 */
export class NoOpMemoryStore implements IMemoryStore {
  async save(_memory: Partial<UserMemory>): Promise<void> {
    // Phase 5: implement persistence
  }

  async load(_userId: string, _platform: Platform): Promise<UserMemory | null> {
    // Phase 5: load from storage
    return null;
  }

  async clear(_userId: string): Promise<void> {
    // Phase 5: clear stored memory
  }
}

export const memoryStore: IMemoryStore = new NoOpMemoryStore();
