/**
 * Thin API client - all dashboard/admin calls go through here.
 * Sends the better-auth session cookie with every request.
 */
import { API_URL } from "./auth-client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Only set JSON content-type when we actually send a body. Empty POST/DELETE
  // with application/json makes Fastify reject the request.
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  // Some endpoints return 204 / empty body
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// ─── Shared response types ────────────────────────────────────────────────────

export interface MeetingListItem {
  id: string;
  title: string;
  platform: string;
  status: string;
  startsAt: string | null;
  endsAt?: string | null;
  durationSeconds: number | null;
  summary: string | null;
  joinEnabled?: boolean;
  hasExternalGuests?: boolean | null;
  calendarEventId?: string | null;
  createdAt: string;
}

export interface TranscriptSegment {
  id: string;
  speakerLabel: string;
  speakerName: string | null;
  startMs: number;
  endMs: number;
  text: string;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  meetingTitle?: string;
  description: string;
  owner: string | null;
  dueDate: string | null;
  status: "open" | "in_progress" | "done" | "dismissed";
  createdAt: string;
}

export interface MeetingDetail {
  meeting: MeetingListItem & {
    meetingUrl: string;
    recordingUrl?: string | null;
    keyPoints: string[] | null;
    decisions: string[] | null;
    speakerStats: Array<{
      speaker: string;
      talkTimeSeconds: number;
      talkTimePercent: number;
      keyPoints: string[];
    }> | null;
    error: string | null;
  };
  segments: TranscriptSegment[];
  actionItems: ActionItem[];
  reports: Array<{ id: string; type: string; status: string; sentTo: string; sentAt: string | null }>;
}

export interface Subscription {
  planId: string;
  planName: string;
  status: string;
  trialEndsAt: string | null;
  meetingSecondsLimit: number | null;
  meetingSecondsUsed: number;
  trialMeetingsUsed: number;
  trialMeetingCap: number;
  canRecord: boolean;
  features: Record<string, boolean>;
}

export interface Plan {
  id: string;
  name: string;
  priceMonthlyCents: number;
  meetingHoursPerMonth: number | null;
  highlights: string[];
  sortOrder: number;
}

export interface CalendarConnection {
  id: string;
  provider: string;
  email: string;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  sendFullReport: boolean;
  sendSummaryReport: boolean;
  autoRecordMode: "all" | "ask" | "external_only" | "none";
  botName: string;
}
