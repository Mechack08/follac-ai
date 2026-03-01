/**
 * @follac/agents
 *
 * Multi-agent system for Follac AI.
 * Import from "@follac/agents" everywhere.
 */

export type { IAgent } from "./base.agent.js";
export { BaseAgent } from "./base.agent.js";
export { ContextAgent } from "./agents/context.agent.js";
export type { ContextAnalysis } from "./agents/context.agent.js";
export { ActionAgent } from "./agents/action.agent.js";
export type { RankedActions } from "./agents/action.agent.js";
export { ResearchAgent } from "./agents/research.agent.js";
export type { ResearchResult, ResearchSource } from "./agents/research.agent.js";
export { ExecutionAgent } from "./agents/execution.agent.js";
export { AgentOrchestrator } from "./orchestrator.js";
export type { OrchestratorResult } from "./orchestrator.js";
