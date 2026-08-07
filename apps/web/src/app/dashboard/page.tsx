"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type MeetingListItem, type Subscription } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Spinner,
  formatDate,
  formatDuration,
  statusTone,
} from "@/components/ui";

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ meetings: MeetingListItem[] }>("/api/meetings")
      .then((res) => setMeetings(res.meetings))
      .catch(() => setMeetings([]));
    api<Subscription>("/api/billing/subscription")
      .then(setSubscription)
      .catch(() => null);
  }, []);

  useEffect(load, [load]);

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

  return (
    <div className="space-y-6">
      {subscription && !subscription.canRecord && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {subscription.status === "expired" || subscription.status === "none"
            ? "Your trial has ended — upgrade to keep recording meetings."
            : "You've reached this month's meeting limit."}{" "}
          <Link href="/dashboard/billing" className="font-semibold underline">
            Upgrade
          </Link>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Reports arrive minutes after each meeting ends.
          </p>
        </div>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-gray-900">Invite the notetaker now</h2>
        <p className="mt-1 text-xs text-gray-500">
          Paste a Google Meet, Zoom, or Teams link and the bot joins immediately.
        </p>
        <form onSubmit={inviteBot} className="mt-3 flex gap-2">
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
      ) : meetings.length === 0 ? (
        <EmptyState
          title="No meetings yet"
          subtitle="Connect your calendar so Follac joins your meetings automatically, or paste a meeting link above."
          action={<Button href="/dashboard/settings">Connect calendar</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Meeting</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meetings.map((meeting) => (
                <tr key={meeting.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/meetings/${meeting.id}`}
                      className="font-medium text-gray-900 hover:text-brand-600"
                    >
                      {meeting.title}
                    </Link>
                    {meeting.summary && (
                      <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-gray-500">
                        {meeting.summary}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(meeting.startsAt)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDuration(meeting.durationSeconds)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(meeting.status)}>{meeting.status.replace(/_/g, " ")}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
