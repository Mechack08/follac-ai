"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  api,
  type CalendarConnection,
  type MeetingListItem,
  type Subscription,
  type UserSettings,
} from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Spinner,
  Switch,
  formatDate,
  formatDuration,
  statusTone,
} from "@/components/ui";

function isUpcoming(m: MeetingListItem, now: number): boolean {
  if (m.status === "scheduled" || m.status === "bot_dispatched") return true;
  if (!m.startsAt) return false;
  return new Date(m.startsAt).getTime() > now - 30 * 60_000 && m.status === "recording";
}

function hoursLabel(seconds: number): string {
  return `${Math.round((seconds / 3600) * 10) / 10}h`;
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [connections, setConnections] = useState<CalendarConnection[] | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ meetings: MeetingListItem[] }>("/api/meetings")
      .then((res) => setMeetings(res.meetings))
      .catch(() => setMeetings([]));
    api<Subscription>("/api/billing/subscription")
      .then(setSubscription)
      .catch(() => null);
    api<{ settings: UserSettings }>("/api/settings")
      .then((res) => setSettings(res.settings))
      .catch(() => null);
    api<{ connections: CalendarConnection[] }>("/api/calendar/connections")
      .then((res) => setConnections(res.connections))
      .catch(() => setConnections([]));
  }, []);

  useEffect(load, [load]);

  const now = Date.now();
  const { upcoming, past } = useMemo(() => {
    if (!meetings) return { upcoming: [] as MeetingListItem[], past: [] as MeetingListItem[] };
    const up: MeetingListItem[] = [];
    const pa: MeetingListItem[] = [];
    for (const m of meetings) {
      if (isUpcoming(m, now) && m.status !== "cancelled") up.push(m);
      else pa.push(m);
    }
    up.sort((a, b) => {
      const at = a.startsAt ? new Date(a.startsAt).getTime() : Infinity;
      const bt = b.startsAt ? new Date(b.startsAt).getTime() : Infinity;
      return at - bt;
    });
    return { upcoming: up, past: pa };
  }, [meetings, now]);

  async function inviteBot(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteError(null);
    try {
      await api("/api/meetings", {
        method: "POST",
        body: JSON.stringify({ meetingUrl: inviteUrl }),
      });
      setInviteUrl("");
      load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Could not invite the bot");
    } finally {
      setInviteBusy(false);
    }
  }

  async function setJoin(meeting: MeetingListItem, joinEnabled: boolean) {
    setTogglingId(meeting.id);
    setMeetings((prev) =>
      prev?.map((m) => (m.id === meeting.id ? { ...m, joinEnabled } : m)) ?? null,
    );
    try {
      await api(`/api/meetings/${meeting.id}`, {
        method: "PATCH",
        body: JSON.stringify({ joinEnabled }),
      });
      load();
    } catch {
      setMeetings((prev) =>
        prev?.map((m) =>
          m.id === meeting.id ? { ...m, joinEnabled: meeting.joinEnabled } : m,
        ) ?? null,
      );
    } finally {
      setTogglingId(null);
    }
  }

  const usagePercent =
    subscription?.meetingSecondsLimit && subscription.meetingSecondsLimit > 0
      ? Math.min(
          100,
          Math.round((subscription.meetingSecondsUsed / subscription.meetingSecondsLimit) * 100),
        )
      : null;

  const needsCalendar = connections !== null && connections.length === 0;
  const joinModeLabel =
    settings?.autoRecordMode === "ask"
      ? "You choose which meetings to join"
      : settings?.autoRecordMode === "external_only"
        ? "Joining meetings with external guests"
        : settings?.autoRecordMode === "none"
          ? "Manual invite only"
          : "Joining all calendar meetings";

  return (
    <div className="w-full space-y-8">
      {subscription && !subscription.canRecord && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {subscription.status === "expired" || subscription.status === "none"
            ? "Your trial has ended. Upgrade to keep recording meetings."
            : "You've reached this month's meeting limit."}{" "}
          <Link href="/dashboard/billing" className="font-semibold underline">
            Upgrade
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950">Meetings</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Control which calls use meeting hours. Reports land after each one ends.
          </p>
        </div>
        {subscription && usagePercent !== null && (
          <Link
            href="/dashboard/billing"
            className="min-w-[200px] rounded-xl border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-neutral-300"
          >
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Hours this period</span>
              <span className="font-medium text-neutral-800">
                {hoursLabel(subscription.meetingSecondsUsed)} /{" "}
                {hoursLabel(subscription.meetingSecondsLimit!)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-full rounded-full ${usagePercent >= 90 ? "bg-amber-500" : "bg-brand-500"}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </Link>
        )}
      </div>

      {(needsCalendar || settings) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {needsCalendar && (
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-neutral-900">Connect your calendar</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                Sync upcoming Meet, Zoom, and Teams links so you can choose which ones Follac joins.
              </p>
              <Button href="/dashboard/settings" className="mt-3" variant="secondary">
                Open settings
              </Button>
            </div>
          )}
          {settings && (
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-neutral-900">Auto-join</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">{joinModeLabel}</p>
              <Link
                href="/dashboard/settings"
                className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                Change in settings
              </Link>
            </div>
          )}
        </div>
      )}

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Invite the notetaker now</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Paste a Google Meet, Zoom, or Teams link and the bot joins immediately.
        </p>
        <form onSubmit={inviteBot} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Input
              placeholder="https://meet.google.com/abc-defg-hij"
              type="url"
              required
              value={inviteUrl}
              onChange={(e) => setInviteUrl(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={inviteBusy}>
            {inviteBusy ? "Sending…" : "Send bot"}
          </Button>
        </form>
        {inviteError && <p className="mt-2 text-sm text-red-600">{inviteError}</p>}
      </Card>

      {!meetings ? (
        <Spinner />
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-neutral-950">Upcoming</h2>
              {settings?.autoRecordMode === "ask" && upcoming.length > 0 && (
                <p className="text-xs text-neutral-500">Turn on Join to use hours on that call</p>
              )}
            </div>

            {upcoming.length === 0 ? (
              <EmptyState
                title="No upcoming meetings"
                subtitle={
                  needsCalendar
                    ? "Connect Google Calendar to see upcoming calls with Meet, Zoom, or Teams links."
                    : "No Meet, Zoom, or Teams links found in the next 7 days. Add a video link to a calendar event, then hit Sync now in Settings."
                }
                action={
                  needsCalendar ? <Button href="/dashboard/settings">Connect calendar</Button> : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                {upcoming.map((meeting) => {
                  const canToggle =
                    meeting.status === "scheduled" || meeting.status === "bot_dispatched";
                  return (
                    <li
                      key={meeting.id}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/dashboard/meetings/${meeting.id}`}
                            className="truncate font-medium text-neutral-900 hover:text-brand-600"
                          >
                            {meeting.title}
                          </Link>
                          <Badge tone={statusTone(meeting.status)}>
                            {meeting.status.replace(/_/g, " ")}
                          </Badge>
                          {meeting.hasExternalGuests && (
                            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                              External
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-neutral-500">
                          {formatDate(meeting.startsAt)} · {meeting.platform.replace(/_/g, " ")}
                        </p>
                      </div>
                      {canToggle && (
                        <div className="w-full shrink-0 sm:w-44">
                          <Switch
                            checked={Boolean(meeting.joinEnabled)}
                            disabled={togglingId === meeting.id}
                            onChange={(next) => void setJoin(meeting, next)}
                            label={meeting.joinEnabled ? "Will join" : "Skipping"}
                            description="Uses meeting hours when on"
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-neutral-950">Recent</h2>
            {past.length === 0 ? (
              <p className="text-sm text-neutral-500">Completed meetings will appear here.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-4 py-3">Meeting</th>
                      <th className="px-4 py-3">When</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {past.map((meeting) => (
                      <tr key={meeting.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/meetings/${meeting.id}`}
                            className="font-medium text-neutral-900 hover:text-brand-600"
                          >
                            {meeting.title}
                          </Link>
                          {meeting.summary && (
                            <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-neutral-500">
                              {meeting.summary}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">{formatDate(meeting.startsAt)}</td>
                        <td className="px-4 py-3 text-neutral-600">
                          {formatDuration(meeting.durationSeconds)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(meeting.status)}>
                            {meeting.status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
