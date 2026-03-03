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
  pageSubType: "own-profile" | "other-profile" | "job-listing" | "feed-post" | "message-thread" | "unknown";
  profileName: string | null;
  profileHeadline: string | null;
  profileCompany: string | null;
  jobTitle: string | null;
  jobCompany: string | null;
  postContent: string | null;
  messageDraft: string | null;
  connectionDegree: "1st" | "2nd" | "3rd" | "unknown" | null;
}
