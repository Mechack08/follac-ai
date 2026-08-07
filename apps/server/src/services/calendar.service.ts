/**
 * Google Calendar integration — separate OAuth consent (calendar.readonly)
 * from login, token refresh, and upcoming-meeting sync into the meetings table.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import {
  getDb,
  newId,
  calendarConnections,
  meetings,
  type Database,
} from "@follac/db";
import { config } from "../config.js";
import { detectPlatform } from "./meeting-bot.service.js";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

function redirectUri(): string {
  return `${config.apiUrl}/api/calendar/callback`;
}

function newOAuthClient() {
  return new google.auth.OAuth2(
    config.calendar.clientId,
    config.calendar.clientSecret,
    redirectUri(),
  );
}

// ─── Signed state (prevents CSRF on the OAuth callback) ──────────────────────

export function signState(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const sig = createHmac("sha256", config.auth.secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString();
    const [userId, ts, sig] = decoded.split(".");
    if (!userId || !ts || !sig) return null;
    const expected = createHmac("sha256", config.auth.secret)
      .update(`${userId}.${ts}`)
      .digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    // 15-minute validity window
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
    return userId;
  } catch {
    return null;
  }
}

// ─── OAuth flow ───────────────────────────────────────────────────────────────

export function getConnectUrl(userId: string): string {
  return newOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: signState(userId),
  });
}

export async function completeConnection(userId: string, code: string): Promise<void> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  const email = profile.email ?? "unknown";

  const db = getDb();
  const [existing] = await db
    .select()
    .from(calendarConnections)
    .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.email, email)))
    .limit(1);

  const values = {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? null,
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    syncEnabled: true,
  };

  if (existing) {
    await db.update(calendarConnections).set(values).where(eq(calendarConnections.id, existing.id));
  } else {
    await db.insert(calendarConnections).values({
      id: newId("cal"),
      userId,
      provider: "google",
      email,
      ...values,
    });
  }
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

type CalendarConnection = typeof calendarConnections.$inferSelect;

async function authedClient(db: Database, conn: CalendarConnection) {
  const client = newOAuthClient();
  client.setCredentials({
    access_token: conn.accessToken,
    refresh_token: conn.refreshToken,
    expiry_date: conn.tokenExpiresAt?.getTime(),
  });
  // Persist refreshed access tokens so we don't re-refresh every sync
  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    void db
      .update(calendarConnections)
      .set({
        accessToken: tokens.access_token,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      })
      .where(eq(calendarConnections.id, conn.id));
  });
  return client;
}

function extractMeetingUrl(event: {
  hangoutLink?: string | null;
  location?: string | null;
  description?: string | null;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> | null } | null;
}): string | null {
  const video = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  if (video?.uri) return video.uri;
  if (event.hangoutLink) return event.hangoutLink;

  const urlPattern =
    /https:\/\/(?:[\w-]+\.)?(?:zoom\.us\/j\/[^\s<>"']+|teams\.(?:microsoft|live)\.com\/[^\s<>"']+|meet\.google\.com\/[a-z-]+)/i;
  for (const field of [event.location, event.description]) {
    const match = field?.match(urlPattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * Pull the next 24h of events for one connection and upsert them as
 * scheduled meetings. Returns the number of meetings created.
 */
export async function syncConnection(conn: CalendarConnection): Promise<number> {
  const db = getDb();
  const client = await authedClient(db, conn);
  const calendar = google.calendar({ version: "v3", auth: client });

  const now = new Date();
  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  let created = 0;
  for (const event of data.items ?? []) {
    if (!event.id || event.status === "cancelled") continue;
    const meetingUrl = extractMeetingUrl(event);
    if (!meetingUrl) continue;

    const [existing] = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(eq(meetings.userId, conn.userId), eq(meetings.calendarEventId, event.id)))
      .limit(1);

    const startsAt = event.start?.dateTime ? new Date(event.start.dateTime) : null;
    const endsAt = event.end?.dateTime ? new Date(event.end.dateTime) : null;

    if (existing) {
      // Keep schedule fresh (meetings get moved all the time)
      await db
        .update(meetings)
        .set({ title: event.summary ?? "Untitled meeting", startsAt, endsAt, updatedAt: new Date() })
        .where(and(eq(meetings.id, existing.id), eq(meetings.status, "scheduled")));
      continue;
    }

    await db.insert(meetings).values({
      id: newId("mtg"),
      userId: conn.userId,
      calendarEventId: event.id,
      title: event.summary ?? "Untitled meeting",
      meetingUrl,
      platform: detectPlatform(meetingUrl),
      status: "scheduled",
      startsAt,
      endsAt,
    });
    created++;
  }

  await db
    .update(calendarConnections)
    .set({ lastSyncedAt: new Date() })
    .where(eq(calendarConnections.id, conn.id));

  return created;
}
