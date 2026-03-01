import { BaseAgent } from "../base.agent.js";
import type { AgentRequest, AgentResponse } from "@follac/shared";

export interface ResearchResult {
  summary: string;
  keyFacts: string[];
  sources: ResearchSource[];
  confidence: number;
}

export interface ResearchSource {
  title: string;
  snippet: string;
  url: string | null;
}

/**
 * ResearchAgent
 *
 * Responsibility: Gather background information about entities mentioned
 * in the user's context (people, companies, topics).
 *
 * Used as a supporting agent — the ActionAgent or Orchestrator may
 * call this before proposing actions that benefit from background info.
 *
 * Example triggers:
 * - User views a LinkedIn profile → research that person's company
 * - User opens a job listing → research the company
 * - User reads an email from an unknown sender → research the sender
 *
 * NOTE: In MVP, this agent uses the LLM's internal knowledge.
 * Future: integrate with Perplexity API or web search.
 */
export class ResearchAgent extends BaseAgent<ResearchResult> {
  readonly agentType = "research" as const;
  readonly name = "Research Agent";
  readonly description = "Gathers background information about people, companies, or topics";

  async run(request: AgentRequest): Promise<AgentResponse<ResearchResult>> {
    return this.runSafe(async () => {
      const query = this.extractResearchQuery(request);

      if (!query) {
        return {
          agentType: this.agentType,
          success: false,
          data: null,
          error: "No researchable entity found in context",
          latencyMs: 0,
        };
      }

      const systemMsg = this.buildSystemMessage(request.context);

      const userMsg = {
        role: "user" as const,
        content: this.buildPrompt(query),
      };

      const { data, latencyMs } = await this.callServer<{
        result: ResearchResult;
        tokenUsage?: AgentResponse["tokenUsage"];
      }>("/api/agents/research", {
        messages: [systemMsg, userMsg],
        query,
        context: request.context,
      });

      return {
        agentType: this.agentType,
        success: true,
        data: data.result,
        error: null,
        tokenUsage: data.tokenUsage,
        latencyMs,
      };
    });
  }

  private extractResearchQuery(request: AgentRequest): string | null {
    const { extractedData, platform } = request.context;

    if (platform === "linkedin") {
      const li = extractedData as Record<string, unknown>;
      if (li.profileName) return `Person: ${li.profileName}, ${li.profileHeadline ?? ""}`;
      if (li.jobCompany) return `Company: ${li.jobCompany}`;
    }

    if (platform === "gmail") {
      const gm = extractedData as Record<string, unknown>;
      if (gm.senderEmail) return `Email sender: ${gm.senderName ?? ""} <${gm.senderEmail}>`;
    }

    return (request.metadata?.["query"] as string) ?? null;
  }

  private buildPrompt(query: string): string {
    return `
Research the following and return a JSON object with this shape:

{
  "summary": "2–3 sentence overview",
  "keyFacts": ["fact1", "fact2", "fact3"],
  "sources": [
    { "title": "string", "snippet": "string", "url": null }
  ],
  "confidence": 0.0–1.0
}

Research target: "${query}"

Rules:
- Use only widely known and reliable information
- Set confidence lower if uncertain or data is not recent
- sources.url may be null if no specific URL is known
`.trim();
  }
}
