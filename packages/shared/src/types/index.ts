/**
 * @follac/shared — Core Domain Types
 *
 * All cross-package types, enums, and constants are defined here.
 * Nothing outside this package should re-declare these.
 */

// ─── Platform ──────────────────────────────────────────────────────────────────

export type Platform = "gmail" | "google-docs" | "linkedin" | "unknown";

export type PageType =
  | "inbox"
  | "email-thread"
  | "email-compose"
  | "document"
  | "profile"
  | "feed"
  | "job-listing"
  | "search-results"
  | "unknown";

// ─── Context Object ────────────────────────────────────────────────────────────

/**
 * The canonical output of the Context Awareness Engine.
 * Every adapter ultimately produces a ContextObject.
 */
export interface ContextObject {
  /** Which platform the user is on */
  platform: Platform;

  /** Granular page classification within the platform */
  pageType: PageType;

  /** Human-readable description of the detected activity */
  detectedActivity: string;

  /**
   * AI-inferred user intent based on activity + history.
   * e.g. "Drafting a follow-up email to a job recruiter"
   */
  inferredIntent: string;

  /** Confidence in the inferred intent [0.0 – 1.0] */
  confidenceScore: number;

  /** Raw extracted data from the adapter (adapter-specific shape) */
  extractedData: Record<string, unknown>;

  /** ISO timestamp of when the context was captured */
  capturedAt: string;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type ActionType =
  | "draft-email"
  | "summarize-thread"
  | "summarize-document"
  | "extract-tasks"
  | "compose-linkedin-message"
  | "generate-reply"
  | "rewrite-paragraph"
  | "research-person"
  | "custom";

export type ActionStatus = "pending" | "approved" | "rejected" | "executing" | "completed" | "failed";

export interface ProposedAction {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: ActionStatus;
  confidence: number;
  createdAt: string;
}

export interface ExecutionResult {
  actionId: string;
  success: boolean;
  output: string | null;
  error: string | null;
  executedAt: string;
}

// ─── Agent Layer ───────────────────────────────────────────────────────────────

export type AgentType = "context" | "action" | "research" | "execution";

export interface AgentMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AgentRequest {
  agentType: AgentType;
  context: ContextObject;
  messages?: AgentMessage[];
  metadata?: Record<string, unknown>;
}

export interface AgentResponse<T = unknown> {
  agentType: AgentType;
  success: boolean;
  data: T | null;
  error: string | null;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

// ─── Messaging (Extension Internal) ──────────────────────────────────────────

export type MessageTopic =
  | "context:detected"
  | "context:changed"
  | "action:proposed"
  | "action:approved"
  | "action:rejected"
  | "action:executing"
  | "action:completed"
  | "action:failed"
  | "overlay:show"
  | "overlay:hide"
  | "memory:save"
  | "memory:query"
  | "fetch:orchestrate"
  | "fetch:execute";

export interface ExtensionMessage<T = unknown> {
  topic: MessageTopic;
  payload: T;
  sourceTab?: number;
  timestamp: string;
}

// ─── Memory (Placeholder — Phase 5) ──────────────────────────────────────────

/** Placeholder for future memory system. Not yet implemented. */
export interface UserMemory {
  userId: string;
  preferences: Record<string, unknown>;
  recentActions: ProposedAction[];
  platform: Platform;
  lastSeen: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface AppState {
  isActive: boolean;
  currentContext: ContextObject | null;
  proposedActions: ProposedAction[];
  isProcessing: boolean;
  lastError: string | null;
}
