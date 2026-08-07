"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type CalendarConnection, type UserSettings } from "@/lib/api";
import { Button, Card, Input, Spinner, formatDate } from "@/components/ui";

export default function SettingsPage() {
  const params = useSearchParams();
  const calendarStatus = params.get("calendar");

  const [connections, setConnections] = useState<CalendarConnection[] | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Calendar, recording, and report preferences.</p>
      </div>

      {calendarStatus === "connected" && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
          Calendar connected. Follac will now join your upcoming meetings automatically.
        </div>
      )}
      {calendarStatus === "error" && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          Calendar connection failed. Please try again.
        </div>
      )}

      <Card>
        <h2 className="text-base font-semibold text-gray-900">Google Calendar</h2>
        <p className="mt-1 text-sm text-gray-500">
          Follac scans upcoming events for meeting links and sends the notetaker automatically.
        </p>
        {!connections ? (
          <Spinner />
        ) : connections.length === 0 ? (
          <Button onClick={() => void connectCalendar()} className="mt-4">
            Connect Google Calendar
          </Button>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {connections.map((conn) => (
              <li key={conn.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{conn.email}</p>
                  <p className="text-xs text-gray-500">
                    Last synced {formatDate(conn.lastSyncedAt)}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => void disconnect(conn.id)}>
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {settings && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900">Recording & reports</h2>
          <form onSubmit={saveSettings} className="mt-4 space-y-5">
            <Input
              label="Bot display name (shown to meeting participants)"
              value={settings.botName}
              onChange={(e) => setSettings({ ...settings, botName: e.target.value })}
            />

            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Which meetings should be recorded automatically?
              </span>
              <select
                value={settings.autoRecordMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    autoRecordMode: e.target.value as UserSettings["autoRecordMode"],
                  })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="all">All calendar meetings</option>
                <option value="external_only">Only meetings with external guests</option>
                <option value="none">None — I&apos;ll invite the bot manually</option>
              </select>
            </div>

            <div className="space-y-2">
              <span className="block text-sm font-medium text-gray-700">Email reports</span>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={settings.sendSummaryReport}
                  onChange={(e) => setSettings({ ...settings, sendSummaryReport: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Executive summary after each meeting
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={settings.sendFullReport}
                  onChange={(e) => setSettings({ ...settings, sendFullReport: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Full report with transcript after each meeting
              </label>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
              {saved && <span className="text-sm text-green-700">Saved.</span>}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
