import { BaseAdapter } from "../base.adapter.js";
import type { ContextObject, ProposedAction, LinkedInContext } from "@follac/shared";
import { generateId, now } from "@follac/shared";

/**
 * LinkedInAdapter
 *
 * Handles context detection for LinkedIn pages.
 * LinkedIn is a highly dynamic SPA. We detect page sub-type from URL
 * patterns and targeted DOM selectors.
 *
 * Supported page types:
 *   - profile      (viewing a person's profile)
 *   - job-listing  (viewing a specific job)
 *   - feed-post    (reading a post)
 *   - search-results
 *   - unknown
 */
export class LinkedInAdapter extends BaseAdapter {
  readonly name = "LinkedIn";

  private observer: MutationObserver | null = null;

  canHandle(url: string): boolean {
    return /^https:\/\/www\.linkedin\.com\//.test(url);
  }

  observe(onChangeCallback: () => void): void {
    this.observer = new MutationObserver(onChangeCallback);
    const main = document.querySelector("main") ?? document.body;
    this.observer.observe(main, { childList: true, subtree: true });
  }

  override teardown(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  async extractData(): Promise<Record<string, unknown>> {
    const pageSubType = this.classifySubType();

    const linkedin: LinkedInContext = {
      pageSubType,
      profileName: this.extractProfileName(pageSubType),
      profileHeadline: this.extractProfileHeadline(),
      profileCompany: this.extractProfileCompany(),
      jobTitle: this.extractJobTitle(pageSubType),
      jobCompany: this.extractJobCompany(pageSubType),
      postContent: this.extractPostContent(pageSubType),
      messageDraft: this.extractMessageDraft(),
      connectionDegree: this.extractConnectionDegree(),
    };

    return linkedin as unknown as Record<string, unknown>;
  }

  async detectContext(): Promise<ContextObject> {
    const data = await this.extractData();
    const li = data as unknown as LinkedInContext;

    const pageType = this.mapToPageType(li.pageSubType);

    return {
      platform: "linkedin",
      pageType,
      detectedActivity: this.describeActivity(li),
      inferredIntent: this.inferIntent(li),
      confidenceScore: this.scoreConfidence(li),
      extractedData: data,
      capturedAt: now(),
    };
  }

  async proposeActions(context: ContextObject): Promise<ProposedAction[]> {
    const li = context.extractedData as unknown as LinkedInContext;
    const actions: ProposedAction[] = [];

    // On someone's profile → offer to compose an outreach message
    if (
      li.pageSubType === "other-profile" &&
      li.profileName &&
      li.connectionDegree !== "1st"
    ) {
      actions.push({
        id: generateId(),
        type: "compose-linkedin-message",
        title: `Message ${li.profileName}`,
        description: `Draft a personalized connection request or message to ${li.profileName}`,
        payload: {
          name: li.profileName,
          headline: li.profileHeadline,
          company: li.profileCompany,
          connectionDegree: li.connectionDegree,
        },
        status: "pending",
        confidence: 0.9,
        createdAt: now(),
      });
    }

    // On a job listing → offer to draft application or analyze fit
    if (li.pageSubType === "job-listing" && li.jobTitle) {
      actions.push({
        id: generateId(),
        type: "draft-email",
        title: "Draft application message",
        description: `Write a cover message for "${li.jobTitle}" at ${li.jobCompany ?? "this company"}`,
        payload: {
          jobTitle: li.jobTitle,
          jobCompany: li.jobCompany,
        },
        status: "pending",
        confidence: 0.88,
        createdAt: now(),
      });

      actions.push({
        id: generateId(),
        type: "research-person",
        title: "Research this company",
        description: `Get a quick overview of ${li.jobCompany ?? "the company"} before applying`,
        payload: { company: li.jobCompany },
        status: "pending",
        confidence: 0.75,
        createdAt: now(),
      });
    }

    // In a message thread with a draft → offer to improve it
    if (li.messageDraft && li.messageDraft.length > 20) {
      actions.push({
        id: generateId(),
        type: "compose-linkedin-message",
        title: "Improve your message",
        description: "Refine tone and effectiveness of your draft",
        payload: { draft: li.messageDraft },
        status: "pending",
        confidence: 0.85,
        createdAt: now(),
      });
    }

    return actions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  // ─── Private DOM Extraction Helpers ─────────────────────────────────────────

  private classifySubType(): LinkedInContext["pageSubType"] {
    const path = window.location.pathname;
    if (path.startsWith("/in/")) {
      const isOwnProfile = !!document.querySelector(".profile-self-data");
      return isOwnProfile ? "own-profile" : "other-profile";
    }
    if (path.startsWith("/jobs/view/")) return "job-listing";
    if (path.startsWith("/feed/")) return "feed-post";
    if (path.startsWith("/messaging/")) return "message-thread";
    return "unknown";
  }

  private mapToPageType(subType: LinkedInContext["pageSubType"]) {
    if (subType === "own-profile" || subType === "other-profile") return "profile" as const;
    if (subType === "job-listing") return "job-listing" as const;
    if (subType === "feed-post") return "feed" as const;
    return "unknown" as const;
  }

  private extractProfileName(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "own-profile" && subType !== "other-profile") return null;
    return (
      this.getTextContent("h1.text-heading-xlarge") ||
      this.getTextContent(".pv-top-card--list li:first-child") ||
      null
    );
  }

  private extractProfileHeadline(): string | null {
    return this.getTextContent(".text-body-medium.break-words");
  }

  private extractProfileCompany(): string | null {
    return (
      this.getTextContent(".pv-text-details__right-panel-item-text") ||
      this.getTextContent("[aria-label='Current company'] .t-normal") ||
      null
    );
  }

  private extractJobTitle(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "job-listing") return null;
    return (
      this.getTextContent(".job-details-jobs-unified-top-card__job-title h1") ||
      this.getTextContent(".topcard__title") ||
      null
    );
  }

  private extractJobCompany(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "job-listing") return null;
    return (
      this.getTextContent(".job-details-jobs-unified-top-card__company-name a") ||
      this.getTextContent(".topcard__org-name-link") ||
      null
    );
  }

  private extractPostContent(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "feed-post") return null;
    return this.querySelector(".feed-shared-update-v2__description")?.textContent?.trim().slice(0, 500) ?? null;
  }

  private extractMessageDraft(): string | null {
    const editor = this.querySelector<HTMLElement>(
      ".msg-form__contenteditable[contenteditable='true']",
    );
    return editor?.innerText?.trim() || null;
  }

  private extractConnectionDegree(): LinkedInContext["connectionDegree"] {
    const degreeEl = this.querySelector(".dist-value");
    const text = degreeEl?.textContent?.trim();
    if (!text) return null;
    if (text.includes("1st")) return "1st";
    if (text.includes("2nd")) return "2nd";
    if (text.includes("3rd")) return "3rd";
    return "unknown";
  }

  private describeActivity(li: LinkedInContext): string {
    if (li.pageSubType === "other-profile" && li.profileName) {
      return `Viewing ${li.profileName}'s LinkedIn profile`;
    }
    if (li.pageSubType === "job-listing" && li.jobTitle) {
      return `Reviewing job: "${li.jobTitle}" at ${li.jobCompany ?? "unknown company"}`;
    }
    if (li.pageSubType === "message-thread") return "Reading or composing a LinkedIn message";
    if (li.pageSubType === "feed-post") return "Reading a LinkedIn post";
    return "Browsing LinkedIn";
  }

  private inferIntent(li: LinkedInContext): string {
    if (li.pageSubType === "other-profile") {
      return li.connectionDegree === "1st"
        ? `Reviewing ${li.profileName ?? "a contact"}'s profile`
        : `Considering reaching out to ${li.profileName ?? "a new connection"}`;
    }
    if (li.pageSubType === "job-listing") return "Evaluating a job opportunity";
    if (li.messageDraft) return "Composing an outreach message";
    return "Networking on LinkedIn";
  }

  private scoreConfidence(li: LinkedInContext): number {
    if (li.pageSubType === "other-profile" && li.profileName) return 0.9;
    if (li.pageSubType === "job-listing" && li.jobTitle) return 0.88;
    if (li.messageDraft) return 0.85;
    if (li.pageSubType !== "unknown") return 0.65;
    return 0.4;
  }
}
