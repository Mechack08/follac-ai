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
  userSettings,
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

  let connectionId: string;
  if (existing) {
    await db.update(calendarConnections).set(values).where(eq(calendarConnections.id, existing.id));
    connectionId = existing.id;
  } else {
    connectionId = newId("cal");
    await db.insert(calendarConnections).values({
      id: connectionId,
      userId,
      provider: "google",
      email,
      ...values,
    });
  }

  // Import upcoming meetings immediately so the dashboard isn't empty until the scheduler runs
  const [conn] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.id, connectionId))
    .limit(1);
  if (conn) {
    try {
      await syncConnection(conn);
    } catch (err) {
      console.error("[calendar] initial sync failed:", err);
    }
  }
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

type CalendarConnection = typeof calendarConnections.$inferSelect;
export type AutoRecordMode = "all" | "ask" | "external_only" | "none";

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
    /https:\/\/(?:[\w-]+\.)?(?:zoom\.us\/j\/[^\s<>"']+|teams\.(?:microsoft|live)\.com\/[^\s<>"']+|meet\.google\.com\/[a-z0-9-]+)/i;
  for (const field of [event.location, event.description]) {
    const match = field?.match(urlPattern);
    if (match) return match[0];
  }
  return null;
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

/** True when any attendee is outside the calendar owner's email domain. */
export function detectExternalGuests(
  ownerEmail: string,
  attendees: Array<{ email?: string | null; self?: boolean | null }> | null | undefined,
): boolean {
  const ownerDomain = emailDomain(ownerEmail);
  if (!ownerDomain || !attendees?.length) return false;
  return attendees.some((a) => {
    if (!a.email || a.self) return false;
    const domain = emailDomain(a.email);
    return domain.length > 0 && domain !== ownerDomain;
  });
}

export function defaultJoinEnabled(
  mode: AutoRecordMode,
  hasExternalGuests: boolean,
): boolean {
  switch (mode) {
    case "all":
      return true;
    case "external_only":
      return hasExternalGuests;
    case "ask":
    case "none":
      return false;
    default:
      return true;
  }
}

/**
 * Pull upcoming events for one connection and upsert them as scheduled
 * meetings. Only events with a Meet / Zoom / Teams link are imported.
 * Returns the number of meetings created.
 */
export async function syncConnection(conn: CalendarConnection): Promise<number> {
  const db = getDb();
  const client = await authedClient(db, conn);
  const calendar = google.calendar({ version: "v3", auth: client });

  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, conn.userId))
    .limit(1);
  const mode = (settings?.autoRecordMode ?? "all") as AutoRecordMode;

  const now = new Date();
  // Look ahead 7 days so the dashboard has a useful upcoming list
  const lookaheadMs = 7 * 24 * 3600 * 1000;
  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + lookaheadMs).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
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

    const startsAt = event.start?.dateTime
      ? new Date(event.start.dateTime)
      : event.start?.date
        ? new Date(event.start.date)
        : null;
    const endsAt = event.end?.dateTime
      ? new Date(event.end.dateTime)
      : event.end?.date
        ? new Date(event.end.date)
        : null;
    const hasExternalGuests = detectExternalGuests(conn.email, event.attendees);

    if (existing) {
      // Keep schedule / guest flag fresh; never overwrite a user's join choice
      await db
        .update(meetings)
        .set({
          title: event.summary ?? "Untitled meeting",
          meetingUrl,
          startsAt,
          endsAt,
          hasExternalGuests,
          updatedAt: new Date(),
        })
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
      hasExternalGuests,
      joinEnabled: defaultJoinEnabled(mode, hasExternalGuests),
    });
    created++;
  }

  await db
    .update(calendarConnections)
    .set({ lastSyncedAt: new Date() })
    .where(eq(calendarConnections.id, conn.id));

  return created;
}
