import { BaseAdapter } from "../base.adapter.js";
import type { ContextObject, ProposedAction, LinkedInContext } from "@follac/shared";
import { now } from "@follac/shared";

/**
 * LinkedInAdapter
 *
 * Full context extraction and action proposals for LinkedIn.
 * LinkedIn is a highly dynamic SPA — we use targeted observation
 * and polling to minimise unnecessary server calls.
 *
 * Detection strategy per page type:
 *   - Profile / Job / Company : MutationObserver on narrow layout container.
 *     URL-keyed contextKey dedup prevents duplicate LLM calls.
 *   - Message thread          : Polling the draft field every 2s (like Docs
 *     does for text selection).  No MutationObserver — the message list
 *     fires constantly as animations and scroll happen.
 *   - Feed / Search           : Minimal — observe layout container but the
 *     contextKey (URL-based) prevents duplicate calls once actions are shown.
 *
 * Supported page sub-types:
 *   own-profile | other-profile | job-listing | company-page |
 *   feed-post   | message-thread | search-results | unknown
 */
export class LinkedInAdapter extends BaseAdapter {
  readonly name = "LinkedIn";

  private observer: MutationObserver | null = null;
  private draftPollTimer: ReturnType<typeof setInterval> | null = null;
  private lastDraft = "";

  canHandle(url: string): boolean {
    return /^https:\/\/www\.linkedin\.com\//.test(url);
  }

  /**
   * Attach observation/polling for context changes.
   * Message threads use draft polling — everything else uses a narrow
   * MutationObserver so we don't fire on every feed animation.
   */
  observe(onChangeCallback: () => void): void {
    const subType = this.classifySubType();

    if (subType === "message-thread") {
      // Poll draft changes — contextKey includes draftLen so server is called
      // only when the user actually starts or significantly edits their message.
      this.draftPollTimer = setInterval(() => {
        const current = this.extractMessageDraft() ?? "";
        if (current !== this.lastDraft) {
          this.lastDraft = current;
          onChangeCallback();
        }
      }, 2000);
      return;
    }

    // For all other page types: watch the main scaffold, not the entire body.
    // LinkedIn's infinite feed fires hundreds of mutations / minute if we watch body.
    const target =
      this.querySelector(".scaffold-layout__main") ??
      this.querySelector("main") ??
      document.body;
    this.observer = new MutationObserver(onChangeCallback);
    // subtree: true so deeply-nested content (job descriptions, profile sections)
    // loading after the SPA navigation triggers a re-detection.
    // The 150ms debounce in debouncedDetect prevents over-firing.
    this.observer.observe(target, { childList: true, subtree: true });
  }

  override teardown(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.draftPollTimer !== null) {
      clearInterval(this.draftPollTimer);
      this.draftPollTimer = null;
    }
    this.lastDraft = "";
  }

  async extractData(): Promise<Record<string, unknown>> {
    const pageSubType = this.classifySubType();

    const linkedin: LinkedInContext = {
      pageSubType,
      // Profile
      profileName: this.extractProfileName(pageSubType),
      profileHeadline: this.extractProfileHeadline(pageSubType),
      profileCompany: this.extractProfileCompany(pageSubType),
      aboutSection: this.extractAboutSection(pageSubType),
      skills: this.extractSkills(pageSubType),
      recentExperience: this.extractRecentExperience(pageSubType),
      mutualConnectionsCount: this.extractMutualConnectionsCount(pageSubType),
      connectionDegree: this.extractConnectionDegree(pageSubType),
      // Job
      jobTitle: this.extractJobTitle(pageSubType),
      jobCompany: this.extractJobCompany(pageSubType),
      jobLocation: this.extractJobLocation(pageSubType),
      jobWorkplaceType: this.extractJobWorkplaceType(pageSubType),
      jobDescription: this.extractJobDescription(pageSubType),
      // Company
      companyName: this.extractCompanyName(pageSubType),
      companyAbout: this.extractCompanyAbout(pageSubType),
      companyIndustry: this.extractCompanyIndustry(pageSubType),
      // Feed
      postContent: this.extractPostContent(pageSubType),
      postAuthor: this.extractPostAuthor(pageSubType),
      // Messaging
      messageDraft: this.extractMessageDraft(),
      messageThreadName: this.extractMessageThreadName(pageSubType),
      messageThreadContent: this.extractMessageThreadContent(pageSubType),
    };

    return linkedin as unknown as Record<string, unknown>;
  }

  async detectContext(): Promise<ContextObject> {
    const data = await this.extractData();
    const li = data as unknown as LinkedInContext;

    return {
      platform: "linkedin",
      pageType: this.mapToPageType(li.pageSubType),
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

    /**
     * Stable ID helper — keyed to page content so re-detections produce
     * identical IDs. This mirrors the Gmail/Docs pattern and ensures result
     * events always find their action card.
     */
    const slug = (s: string | null) =>
      (s ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

    const sid = (type: string): string => {
      if (li.pageSubType === "other-profile") return `li-profile-${slug(li.profileName)}-${type}`;
      if (li.pageSubType === "job-listing") return `li-job-${slug(li.jobTitle)}-${type}`;
      if (li.pageSubType === "company-page") return `li-company-${slug(li.companyName)}-${type}`;
      if (li.pageSubType === "message-thread") return `li-msg-${slug(li.messageThreadName)}-${type}`;
      return `li-${li.pageSubType}-${type}`;
    };

    // ── Other person's profile ─────────────────────────────────────────────
    if (li.pageSubType === "other-profile" && li.profileName) {
      // 2nd / 3rd degree → compose a connection request or cold outreach
      if (li.connectionDegree !== "1st") {
        actions.push({
          id: sid("compose-message"),
          type: "compose-linkedin-message",
          title: `Message ${li.profileName}`,
          description: `Draft a personalized outreach to ${li.profileName}${li.connectionDegree ? ` (${li.connectionDegree} degree)` : ""}`,
          payload: {
            name: li.profileName,
            headline: li.profileHeadline,
            company: li.profileCompany,
            aboutSection: li.aboutSection,
            skills: li.skills,
            connectionDegree: li.connectionDegree,
            mutualConnectionsCount: li.mutualConnectionsCount,
          },
          status: "pending",
          confidence: 0.93,
          createdAt: now(),
        });
      }

      // Profile research card — always useful regardless of connection degree
      actions.push({
        id: sid("research-person"),
        type: "research-person",
        title: `Research ${li.profileName}`,
        description: "Get a concise professional overview and conversation talking points",
        payload: {
          name: li.profileName,
          headline: li.profileHeadline,
          company: li.profileCompany,
          aboutSection: li.aboutSection,
          skills: li.skills,
          recentExperience: li.recentExperience,
          connectionDegree: li.connectionDegree,
        },
        status: "pending",
        confidence: 0.88,
        createdAt: now(),
      });
    }

    // ── Job listing ──────────────────────────────────────────────────────────
    if (li.pageSubType === "job-listing" && li.jobTitle) {
      actions.push({
        id: sid("draft-application"),
        type: "draft-job-application",
        title: "Draft application message",
        description: `Write a tailored cover message for "${li.jobTitle}"${li.jobCompany ? ` at ${li.jobCompany}` : ""}`,
        payload: {
          jobTitle: li.jobTitle,
          jobCompany: li.jobCompany,
          jobLocation: li.jobLocation,
          jobWorkplaceType: li.jobWorkplaceType,
          jobDescription: li.jobDescription,
        },
        status: "pending",
        confidence: 0.93,
        createdAt: now(),
      });

      if (li.jobCompany) {
        actions.push({
          id: sid("research-company"),
          type: "research-company",
          title: `Research ${li.jobCompany}`,
          description: "Get a company overview — culture, products, what to mention in your application",
          payload: {
            companyName: li.jobCompany,
            companyAbout: null, // not available from job page — LLM uses its training knowledge
            companyIndustry: null,
            jobTitle: li.jobTitle,
          },
          status: "pending",
          confidence: 0.85,
          createdAt: now(),
        });
      }
    }

    // ── Company page ─────────────────────────────────────────────────────────
    if (li.pageSubType === "company-page" && li.companyName) {
      actions.push({
        id: sid("research-company"),
        type: "research-company",
        title: `Research ${li.companyName}`,
        description: "Structured overview: what they do, culture signals, talking points",
        payload: {
          companyName: li.companyName,
          companyAbout: li.companyAbout,
          companyIndustry: li.companyIndustry,
          jobTitle: null,
        },
        status: "pending",
        confidence: 0.92,
        createdAt: now(),
      });
    }

    // ── Message thread — improve / write draft ────────────────────────────────
    if (li.messageDraft && li.messageDraft.length > 20) {
      actions.push({
        id: sid("improve-draft"),
        type: "compose-linkedin-message",
        title: "Improve your message",
        description: "Refine tone, clarity, and effectiveness of your draft",
        payload: {
          draft: li.messageDraft,
          recipientName: li.messageThreadName,
          threadContext: li.messageThreadContent,
        },
        status: "pending",
        confidence: 0.88,
        createdAt: now(),
      });
    }

    // Empty message thread — offer to start the conversation
    if (
      li.pageSubType === "message-thread" &&
      li.messageThreadName &&
      !li.messageDraft
    ) {
      actions.push({
        id: sid("start-message"),
        type: "compose-linkedin-message",
        title: `Message ${li.messageThreadName}`,
        description: "Draft a message to start or continue this conversation",
        payload: {
          recipientName: li.messageThreadName,
          threadContext: li.messageThreadContent,
        },
        status: "pending",
        confidence: 0.78,
        createdAt: now(),
      });
    }

    return actions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  // ── Page classification ────────────────────────────────────────────────────

  private classifySubType(): LinkedInContext["pageSubType"] {
    const path = window.location.pathname;
    if (path.startsWith("/in/")) {
      const isOwnProfile = !!document.querySelector(
        '.profile-self-data, [data-view-name="profile-self-top-card"]',
      );
      return isOwnProfile ? "own-profile" : "other-profile";
    }
    if (path.startsWith("/jobs/view/") || path.startsWith("/jobs/collections/")) return "job-listing";
    if (path.startsWith("/company/")) return "company-page";
    if (path.startsWith("/feed/") || path === "/feed" || path.startsWith("/posts/")) return "feed-post";
    if (path.startsWith("/messaging/")) return "message-thread";
    if (path.startsWith("/search/results/")) return "search-results";
    return "unknown";
  }

  private mapToPageType(subType: LinkedInContext["pageSubType"]) {
    if (subType === "own-profile" || subType === "other-profile") return "profile" as const;
    if (subType === "job-listing") return "job-listing" as const;
    if (subType === "feed-post") return "feed" as const;
    if (subType === "search-results") return "search-results" as const;
    return "unknown" as const;
  }

  // ── Profile extraction ─────────────────────────────────────────────────────

  private extractProfileName(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "own-profile" && subType !== "other-profile") return null;
    return (
      this.getTextContent("h1.text-heading-xlarge") ||
      this.getTextContent(".pv-top-card--list h1") ||
      null
    );
  }

  private extractProfileHeadline(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "own-profile" && subType !== "other-profile") return null;
    return (
      this.getTextContent(".text-body-medium.break-words") ||
      this.getTextContent(".pv-top-card-profile-picture ~ div .text-body-medium") ||
      null
    );
  }

  private extractProfileCompany(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "own-profile" && subType !== "other-profile") return null;
    return (
      this.getTextContent(".pv-text-details__right-panel-item-text") ||
      this.getTextContent("[aria-label*='Current company'] .t-normal") ||
      null
    );
  }

  private extractAboutSection(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "own-profile" && subType !== "other-profile") return null;
    const about =
      this.querySelector("#about")
        ?.closest("section")
        ?.querySelector(".inline-show-more-text, .pv-shared-text-with-see-more span[aria-hidden='true']") ??
      this.querySelector(".pv-about-section .pv-about__summary-text");
    return about?.textContent?.trim().slice(0, 1000) ?? null;
  }

  private extractSkills(subType: LinkedInContext["pageSubType"]): string[] {
    if (subType !== "own-profile" && subType !== "other-profile") return [];
    const items = document.querySelectorAll<HTMLElement>(
      ".pvs-list .pv-skill-category-entity__name-text, " +
        "[id*='skills'] .pvs-list__item--with-top-padding .t-bold span[aria-hidden='true']",
    );
    return Array.from(items)
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 8);
  }

  private extractRecentExperience(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "own-profile" && subType !== "other-profile") return null;
    const expSection = this.querySelector("#experience")?.closest("section");
    if (!expSection) return null;
    const firstItem = expSection.querySelector(".pvs-list__item--line-separated");
    return firstItem?.textContent?.replace(/\s+/g, " ").trim().slice(0, 400) ?? null;
  }

  private extractMutualConnectionsCount(subType: LinkedInContext["pageSubType"]): number | null {
    if (subType !== "other-profile") return null;
    const el =
      this.querySelector(".member-insights__container a") ??
      this.querySelector("[data-field='mutual_connections'] a");
    const text = el?.textContent?.trim();
    if (!text) return null;
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  private extractConnectionDegree(subType: LinkedInContext["pageSubType"]): LinkedInContext["connectionDegree"] {
    if (subType !== "own-profile" && subType !== "other-profile") return null;
    const degreeEl = this.querySelector(".dist-value");
    const text = degreeEl?.textContent?.trim();
    if (!text) return null;
    if (text.includes("1st")) return "1st";
    if (text.includes("2nd")) return "2nd";
    if (text.includes("3rd")) return "3rd";
    return "unknown";
  }

  // ── Job extraction ─────────────────────────────────────────────────────────

  private extractJobTitle(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "job-listing") return null;
    return (
      this.getTextContent(".job-details-jobs-unified-top-card__job-title h1") ||
      this.getTextContent("h1.job-details-jobs-unified-top-card__job-title") ||
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

  private extractJobLocation(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "job-listing") return null;
    return (
      this.getTextContent(".job-details-jobs-unified-top-card__bullet") ||
      this.getTextContent(".topcard__flavor--bullet") ||
      null
    );
  }

  private extractJobWorkplaceType(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "job-listing") return null;
    return this.getTextContent(".job-details-jobs-unified-top-card__workplace-type") ?? null;
  }

  private extractJobDescription(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "job-listing") return null;
    const container =
      this.querySelector(".jobs-description-content__text") ??
      this.querySelector("#job-details") ??
      this.querySelector(".jobs-description");
    if (!container) return null;
    return container.textContent?.replace(/\s+/g, " ").trim().slice(0, 3000) ?? null;
  }

  // ── Company extraction ─────────────────────────────────────────────────────

  private extractCompanyName(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "company-page") return null;
    return (
      this.getTextContent("h1.org-top-card-summary__title") ||
      this.getTextContent(".org-top-card-summary__title") ||
      null
    );
  }

  private extractCompanyAbout(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "company-page") return null;
    const container =
      this.querySelector(".org-about-us-organization-description__text") ??
      this.querySelector(".organization-about-us-container p") ??
      this.querySelector("[data-test-id='about-us'] p");
    return container?.textContent?.trim().slice(0, 1000) ?? null;
  }

  private extractCompanyIndustry(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "company-page") return null;
    return (
      this.getTextContent(".org-top-card-summary-info-list__info-item:first-child") || null
    );
  }

  // ── Feed / post extraction ─────────────────────────────────────────────────

  private extractPostContent(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "feed-post") return null;
    return (
      this.querySelector(".feed-shared-update-v2__description")?.textContent?.trim().slice(0, 500) ??
      this.querySelector(".update-components-text span[aria-hidden='true']")?.textContent?.trim().slice(0, 500) ??
      null
    );
  }

  private extractPostAuthor(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "feed-post") return null;
    return (
      this.getTextContent(".feed-shared-actor__name .hoverable-link-text") ||
      this.getTextContent(".update-components-actor__name span[aria-hidden='true']") ||
      null
    );
  }

  // ── Message extraction ─────────────────────────────────────────────────────

  private extractMessageDraft(): string | null {
    const editor = this.querySelector<HTMLElement>(
      ".msg-form__contenteditable[contenteditable='true']",
    );
    return editor?.innerText?.trim() || null;
  }

  private extractMessageThreadName(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "message-thread") return null;
    return (
      this.getTextContent(".msg-entity-lockup__entity-title") ||
      this.getTextContent(".msg-conversation-listitem__participant-names .truncate") ||
      null
    );
  }

  private extractMessageThreadContent(subType: LinkedInContext["pageSubType"]): string | null {
    if (subType !== "message-thread") return null;
    const msgs = document.querySelectorAll<HTMLElement>(".msg-s-event-listitem__body");
    if (!msgs.length) return null;
    // Last 3 messages for context
    return Array.from(msgs)
      .slice(-3)
      .map((m) => m.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" | ")
      .slice(0, 800);
  }

  // ── Activity / intent / confidence ────────────────────────────────────────

  private describeActivity(li: LinkedInContext): string {
    if (li.pageSubType === "other-profile" && li.profileName) {
      const degree = li.connectionDegree ? ` (${li.connectionDegree} degree)` : "";
      return `Viewing ${li.profileName}'s LinkedIn profile${degree}`;
    }
    if (li.pageSubType === "job-listing" && li.jobTitle) {
      return `Reviewing job: "${li.jobTitle}"${li.jobCompany ? ` at ${li.jobCompany}` : ""}`;
    }
    if (li.pageSubType === "company-page" && li.companyName) {
      return `Browsing ${li.companyName}'s company page`;
    }
    if (li.pageSubType === "message-thread") {
      if (li.messageDraft) return "Composing a LinkedIn message";
      return `Reading messages${li.messageThreadName ? ` with ${li.messageThreadName}` : ""}`;
    }
    if (li.pageSubType === "feed-post") {
      return li.postAuthor ? `Reading a post by ${li.postAuthor}` : "Reading a LinkedIn post";
    }
    if (li.pageSubType === "search-results") return "Searching on LinkedIn";
    return "Browsing LinkedIn";
  }

  private inferIntent(li: LinkedInContext): string {
    if (li.pageSubType === "other-profile") {
      if (li.connectionDegree === "1st") return `Reviewing ${li.profileName ?? "a contact"}'s profile`;
      return `Considering reaching out to ${li.profileName ?? "a new connection"}`;
    }
    if (li.pageSubType === "job-listing") {
      return `Evaluating the ${li.jobTitle ?? "job"} role${li.jobCompany ? ` at ${li.jobCompany}` : ""}`;
    }
    if (li.pageSubType === "company-page") return `Researching ${li.companyName ?? "this company"}`;
    if (li.messageDraft) return "Composing or improving an outreach message";
    if (li.pageSubType === "message-thread") return "Managing LinkedIn conversations";
    return "Networking on LinkedIn";
  }

  private scoreConfidence(li: LinkedInContext): number {
    if (li.pageSubType === "other-profile" && li.profileName) return 0.92;
    if (li.pageSubType === "job-listing" && li.jobTitle) return 0.9;
    if (li.pageSubType === "company-page" && li.companyName) return 0.88;
    if (li.messageDraft) return 0.85;
    if (li.pageSubType !== "unknown") return 0.65;
    return 0.4;
  }
}
