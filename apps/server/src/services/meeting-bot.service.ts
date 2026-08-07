/**
 * Meeting bot provider — Recall.ai implementation behind a narrow interface
 * so a self-hosted bot could replace it later without touching callers.
 */
import { config } from "../config.js";

export interface DispatchBotInput {
  meetingUrl: string;
  botName: string;
  /** Our internal meeting id, echoed back in webhooks via metadata */
  meetingId: string;
  /** Optional ISO timestamp — when set, the provider joins at that time */
  joinAt?: string;
}

export interface MeetingBotProvider {
  dispatchBot(input: DispatchBotInput): Promise<{ botId: string }>;
  /** Time-limited download URL for the finished recording, or null if not ready */
  getRecordingUrl(botId: string): Promise<string | null>;
  removeBot(botId: string): Promise<void>;
}

class RecallProvider implements MeetingBotProvider {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${config.recall.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Token ${config.recall.apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Recall API ${res.status} on ${path}: ${body.slice(0, 500)}`);
    }
    // DELETE returns 204 with empty body
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async dispatchBot(input: DispatchBotInput): Promise<{ botId: string }> {
    const body: Record<string, unknown> = {
      meeting_url: input.meetingUrl,
      bot_name: input.botName,
      metadata: { meetingId: input.meetingId },
      recording_config: {
        // Mixed audio is all we need for diarized STT; cheaper than video
        audio_mixed_mp3: {},
      },
    };
    if (input.joinAt) body["join_at"] = input.joinAt;

    const bot = await this.request<{ id: string }>("/api/v1/bot/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { botId: bot.id };
  }

  async getRecordingUrl(botId: string): Promise<string | null> {
    const bot = await this.request<RecallBot>(`/api/v1/bot/${botId}/`);

    // Newer API shape: recordings[].media_shortcuts
    const shortcuts = bot.recordings?.[0]?.media_shortcuts;
    const mediaUrl =
      shortcuts?.audio_mixed?.data?.download_url ??
      shortcuts?.video_mixed?.data?.download_url;
    if (mediaUrl) return mediaUrl;

    // Legacy shape
    if (bot.video_url) return bot.video_url;
    return null;
  }

  async removeBot(botId: string): Promise<void> {
    await this.request(`/api/v1/bot/${botId}/leave_call/`, { method: "POST" }).catch(() => {
      // Bot may have already left — not an error worth surfacing
    });
  }
}

interface RecallBot {
  id: string;
  video_url?: string | null;
  recordings?: Array<{
    media_shortcuts?: {
      audio_mixed?: { data?: { download_url?: string } };
      video_mixed?: { data?: { download_url?: string } };
    };
  }>;
}

export const meetingBotProvider: MeetingBotProvider = new RecallProvider();

/** Detect the meeting platform from its URL */
export function detectPlatform(url: string): "google_meet" | "zoom" | "teams" | "other" {
  if (/meet\.google\.com/i.test(url)) return "google_meet";
  if (/zoom\.us/i.test(url)) return "zoom";
  if (/teams\.(microsoft|live)\.com/i.test(url)) return "teams";
  return "other";
}
