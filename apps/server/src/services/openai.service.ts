/**
 * OpenAI Service
 *
 * Thin abstraction over the OpenAI client.
 * All LLM calls go through this service — making it easy to swap
 * providers (Anthropic, Gemini, local Ollama) without touching agent code.
 *
 * Contract: always returns structured JSON.
 * If the model returns invalid JSON, we throw — the route handler catches it.
 */

import OpenAI from "openai";
import { config } from "../config.js";
import type { AgentMessage } from "@follac/shared";

const client = new OpenAI({ apiKey: config.openai.apiKey });

export interface LLMCallOptions {
  messages: AgentMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LLMResponse {
  content: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const {
    messages,
    model = config.openai.model,
    temperature = config.openai.temperature,
    maxTokens = config.openai.maxTokens,
    jsonMode = true,
  } = options;

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

  return {
    content: choice.message.content,
    tokenUsage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
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
