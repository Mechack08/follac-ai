"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type CalendarConnection, type UserSettings } from "@/lib/api";
import { Button, Card, Input, Spinner, Switch, formatDate } from "@/components/ui";

const RECORD_MODES: Array<{
  value: UserSettings["autoRecordMode"];
  title: string;
  body: string;
}> = [
  {
    value: "all",
    title: "Join every calendar meeting",
    body: "Follac joins automatically whenever a synced event has a meeting link.",
  },
  {
    value: "ask",
    title: "Let me choose per meeting",
    body: "Upcoming meetings stay off by default. Turn Join on only for the important ones and save hours.",
  },
  {
    value: "external_only",
    title: "Only meetings with external guests",
    body: "Skips internal-only calls. Joins when someone outside your email domain is invited.",
  },
  {
    value: "none",
    title: "Manual only",
    body: "Never auto-join. Paste a link on the Meetings page when you want the bot.",
  },
];

export default function SettingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const params = useSearchParams();
  const calendarStatus = params.get("calendar");

  const [connections, setConnections] = useState<CalendarConnection[] | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ connections: CalendarConnection[] }>("/api/calendar/connections")
      .then((res) => setConnections(res.connections))
      .catch(() => setConnections([]));
    api<{ settings: UserSettings }>("/api/settings")
      .then((res) => setSettings(res.settings))
      .catch(() => null);
  }, []);

  async function connectCalendar() {
    const { url } = await api<{ url: string }>("/api/calendar/connect");
    window.location.href = url;
  }

  async function disconnect(id: string) {
    await api(`/api/calendar/connections/${id}`, { method: "DELETE" });
    setConnections((prev) => prev?.filter((c) => c.id !== id) ?? null);
  }

  async function toggleSync(conn: CalendarConnection, syncEnabled: boolean) {
    setConnections(
      (prev) => prev?.map((c) => (c.id === conn.id ? { ...c, syncEnabled } : c)) ?? null,
    );
    try {
      await api(`/api/calendar/connections/${conn.id}`, {
        method: "PATCH",
        body: JSON.stringify({ syncEnabled }),
      });
    } catch {
      setConnections(
        (prev) =>
          prev?.map((c) => (c.id === conn.id ? { ...c, syncEnabled: conn.syncEnabled } : c)) ??
          null,
      );
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await api<{ synced: number; meetingsCreated: number }>("/api/calendar/sync", {
        method: "POST",
      });
      setSyncMsg(
        res.meetingsCreated > 0
          ? `Synced. ${res.meetingsCreated} new meeting${res.meetingsCreated === 1 ? "" : "s"} added.`
          : "Synced. No new meetings with video links in the next 7 days.",
      );
      const refreshed = await api<{ connections: CalendarConnection[] }>("/api/calendar/connections");
      setConnections(refreshed.connections);
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await api<{ settings: UserSettings }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          sendFullReport: settings.sendFullReport,
          sendSummaryReport: settings.sendSummaryReport,
          autoRecordMode: settings.autoRecordMode,
          botName: settings.botName,
        }),
      });
      setSettings(res.settings);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-950">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Calendar, join rules, browser assist, and reports.
        </p>
      </div>

      {calendarStatus === "connected" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          Calendar connected. Review join rules below so you only spend hours on the meetings that
          matter.
        </div>
      )}
      {calendarStatus === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Calendar connection failed. Please try again.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-full">
          <h2 className="text-base font-semibold text-neutral-900">Google Calendar</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Follac reads the next 7 days of events with Meet, Zoom, or Teams links. You control which
            ones get a bot.
          </p>
          {!connections ? (
            <Spinner />
          ) : connections.length === 0 ? (
            <Button onClick={() => void connectCalendar()} className="mt-6">
              Connect Google Calendar
            </Button>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-neutral-100">
                {connections.map((conn) => (
                  <li key={conn.id} className="space-y-3 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{conn.email}</p>
                        <p className="text-xs text-neutral-500">
                          Last synced {formatDate(conn.lastSyncedAt)}
                        </p>
                      </div>
                      <Button variant="secondary" onClick={() => void disconnect(conn.id)}>
                        Disconnect
                      </Button>
                    </div>
                    <Switch
                      checked={conn.syncEnabled}
                      onChange={(next) => void toggleSync(conn, next)}
                      label="Keep syncing this calendar"
                      description="Pause anytime without disconnecting"
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={() => void syncNow()} disabled={syncing}>
                  {syncing ? "Syncing…" : "Sync now"}
                </Button>
                {syncMsg && <span className="text-sm text-neutral-600">{syncMsg}</span>}
              </div>
            </>
          )}
        </Card>

        <Card className="h-full">
          <h2 className="text-base font-semibold text-neutral-900">Browser assist</h2>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">
            Install the Chrome extension for help in Gmail, Google Docs, and LinkedIn. Actions only
            run after you approve them.
          </p>
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm text-neutral-600">
            <li>
              Build the extension from{" "}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">apps/extension</code>.
            </li>
            <li>
              Open{" "}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">chrome://extensions</code>
              , enable Developer mode, and load the{" "}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">dist</code> folder.
            </li>
            <li>Sign in from the extension popup with the same Follac account.</li>
          </ol>
          <p className="mt-5 text-xs text-neutral-500">
            A Chrome Web Store listing can replace these steps once the extension is published.
          </p>
        </Card>
      </div>

      {settings && (
        <Card>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">When should Follac join?</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Meeting hours are limited on most plans. Skip routine standups and keep hours for
                the calls that matter.
              </p>
            </div>
          </div>

          <form onSubmit={saveSettings} className="mt-6 space-y-6">
            <div className="max-w-md">
              <Input
                label="Bot display name (shown to meeting participants)"
                value={settings.botName}
                onChange={(e) => setSettings({ ...settings, botName: e.target.value })}
              />
            </div>

            <fieldset>
              <legend className="mb-3 text-sm font-medium text-neutral-700">
                Default for new calendar meetings
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {RECORD_MODES.map((mode) => {
                  const selected = settings.autoRecordMode === mode.value;
                  return (
                    <label
                      key={mode.value}
                      className={`flex h-full cursor-pointer gap-3 rounded-xl border px-4 py-4 transition-colors ${
                        selected
                          ? "border-brand-300 bg-brand-50/60"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="autoRecordMode"
                        className="mt-1 accent-[#FF0034]"
                        checked={selected}
                        onChange={() => setSettings({ ...settings, autoRecordMode: mode.value })}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-neutral-900">
                          {mode.title}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-neutral-500">
                          {mode.body}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <p className="text-xs text-neutral-500">
              You can still flip Join on or off for any upcoming meeting on the Meetings page.
              Saving a new default updates scheduled meetings that have not started yet.
            </p>

            <div className="grid gap-6 border-t border-neutral-100 pt-6 sm:grid-cols-2 sm:items-end">
              <div className="space-y-2">
                <span className="block text-sm font-medium text-neutral-700">Email reports</span>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={settings.sendSummaryReport}
                    onChange={(e) =>
                      setSettings({ ...settings, sendSummaryReport: e.target.checked })
                    }
                    className="rounded border-neutral-300"
                  />
                  Executive summary after each meeting
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={settings.sendFullReport}
                    onChange={(e) =>
                      setSettings({ ...settings, sendFullReport: e.target.checked })
                    }
                    className="rounded border-neutral-300"
                  />
                  Full report with transcript after each meeting
                </label>
              </div>

              <div className="flex items-center justify-end gap-3">
                {saved && <span className="text-sm text-emerald-700">Saved.</span>}
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
