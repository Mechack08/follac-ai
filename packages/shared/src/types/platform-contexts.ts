/**
 * Gmail-specific extracted data shape.
 * Populated by the Gmail platform adapter.
 */
export interface GmailContext {
  threadId: string | null;
  subject: string | null;
  senderName: string | null;
  senderEmail: string | null;
  recipientEmails: string[];
  bodyPreview: string | null;
  isComposing: boolean;
  composeDraft: string | null;
  labelIds: string[];
  messageCount: number;
}

/**
 * Google Docs-specific extracted data shape.
 */
export interface DocsContext {
  documentId: string | null;
  documentTitle: string | null;
  selectedText: string | null;
  /** Full document body text, extracted from the accessible DOM layer. */
  bodyText: string | null;
  /** Heading titles extracted from the document structure. */
  headings: string[];
  cursorParagraph: string | null;
  wordCount: number | null;
  lastEditedBy: string | null;
  isEditing: boolean;
  shareEmails: string[];
}

/**
 * LinkedIn-specific extracted data shape.
 */
export interface LinkedInContext {
  pageSubType:
    | "own-profile"
    | "other-profile"
    | "job-listing"
    | "feed-post"
    | "message-thread"
    | "company-page"
    | "search-results"
    | "unknown";

  // ── Profile fields ─────────────────────────────────────────────────────────
  profileName: string | null;
  profileHeadline: string | null;
  profileCompany: string | null;
  /** Profile about / bio section text (up to 1 000 chars) */
  aboutSection: string | null;
  /** Top skills listed on the profile */
  skills: string[];
  /** Most recent experience entry text */
  recentExperience: string | null;
  /** Number of mutual connections shown on the profile */
  mutualConnectionsCount: number | null;
  connectionDegree: "1st" | "2nd" | "3rd" | "unknown" | null;

  // ── Job listing fields ──────────────────────────────────────────────────────
  jobTitle: string | null;
  jobCompany: string | null;
  jobLocation: string | null;
  /** e.g. "Remote", "Hybrid", "On-site" */
  jobWorkplaceType: string | null;
  /** Full job description text (up to 3 000 chars) */
  jobDescription: string | null;

  // ── Company page fields ─────────────────────────────────────────────────────
  companyName: string | null;
  companyAbout: string | null;
  companyIndustry: string | null;

  // ── Feed / post fields ──────────────────────────────────────────────────────
  postContent: string | null;
  postAuthor: string | null;

  // ── Messaging fields ────────────────────────────────────────────────────────
  messageDraft: string | null;
  messageThreadName: string | null;
  /** Last 3 messages in the thread joined by " | " (up to 800 chars) */
  messageThreadContent: string | null;
}
