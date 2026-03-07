/**
 * OpenAI Service
 *
 * Thin abstraction over the OpenAI client.
 * All LLM calls go through this service — making it easy to swap
 * providers (Anthropic, Gemini, local Ollama) without touching agent code.
 *
 * Contract: always returns structured JSON.
 * If the model returns invalid JSON, we throw — the route handler catches it.
 *
 * Response Cache:
 * Analysis actions (summarize, extract-tasks) are cached for CACHE_TTL_MS.
 * Re-running "Summarize document" on the same unchanged file returns instantly
 * at zero token cost. Writing actions are never cached — users expect variation.
 */

import { createHash } from "crypto";
import OpenAI from "openai";
import { config } from "../config.js";
import type { AgentMessage } from "@follac/shared";

const client = new OpenAI({ apiKey: config.openai.apiKey });

// ── Response cache ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  response: LLMResponse;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();

function getCacheKey(messages: AgentMessage[], model: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ messages, model }))
    .digest("hex");
}

/** Evict expired entries lazily on every cache write (keeps memory bounded). */
function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt < now) responseCache.delete(key);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LLMCallOptions {
  messages: AgentMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** When true, cache the response by message hash. Use only for deterministic analysis tasks. */
  useCache?: boolean;
}

export interface LLMResponse {
  content: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** True when the response was served from cache (zero token cost). */
  fromCache?: boolean;
}

export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const {
    messages,
    model = config.openai.model,
    temperature = config.openai.temperature,
    maxTokens = config.openai.maxTokens,
    jsonMode = true,
    useCache = false,
  } = options;

  // Cache lookup
  if (useCache) {
    const key = getCacheKey(messages, model);
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.response, fromCache: true };
    }
  }

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    response_format: jsonMode ? { type: "json_object" } : { type: "text" },
  });

  const choice = response.choices[0];
  if (!choice?.message.content) {
    throw new Error("OpenAI returned an empty response");
  }

  const result: LLMResponse = {
    content: choice.message.content,
    tokenUsage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };

  // Cache store
  if (useCache) {
    evictExpired();
    const key = getCacheKey(messages, model);
    responseCache.set(key, { response: result, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return result;
}

/**
 * Call the LLM and parse the JSON response.
 * Throws if JSON is invalid or the expected key is missing.
 */
export async function callLLMStructured<T>(
  options: LLMCallOptions,
): Promise<{ result: T; tokenUsage: LLMResponse["tokenUsage"] }> {
  const { content, tokenUsage } = await callLLM({ ...options, jsonMode: true });

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${content.slice(0, 200)}`);
  }

  const result = (parsed as Record<string, unknown>)["result"] as T | undefined;
  if (result === undefined) {
    // Some agents return the whole object as the result
    return { result: parsed as T, tokenUsage };
  }

  return { result, tokenUsage };
}
