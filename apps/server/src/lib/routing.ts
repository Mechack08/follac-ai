/**
 * Action routing tables — single source of truth shared between
 * agent.routes.ts (slow path) and orchestrate.routes.ts (direct execute path).
 *
 * Writing tasks produce user-facing creative text → GPT-4o quality matters.
 * Analysis tasks extract or summarise facts → GPT-4o-mini is sufficient (~20× cheaper).
 * Analysis results are also cached (same doc → same answer → zero tokens).
 */

export const WRITING_TASKS = new Set([
  "draft-email",
  "generate-reply",
  "rewrite-paragraph",
  "write-section",
  "compose-linkedin-message",
]);

export const ANALYSIS_TASKS = new Set([
  "summarize-document",
  "summarize-thread",
  "extract-tasks",
  "research-person",
]);

/** Hard output-token budget per action type. Prevents over-allocation. */
export const MAX_TOKENS_BY_TYPE: Record<string, number> = {
  "generate-reply": 600,
  "draft-email": 800,
  "compose-linkedin-message": 400,
  "rewrite-paragraph": 800,
  "write-section": 1200,
  "summarize-thread": 800,
  "summarize-document": 1200,
  "extract-tasks": 1000,
  "research-person": 600,
};
