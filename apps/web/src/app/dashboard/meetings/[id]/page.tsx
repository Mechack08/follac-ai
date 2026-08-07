"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, type MeetingDetail } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  Spinner,
  Switch,
  formatDate,
  formatDuration,
  statusTone,
} from "@/components/ui";

function msToClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const speakerColors = [
  "text-brand-700",
  "text-emerald-700",
  "text-rose-700",
  "text-amber-700",
  "text-sky-700",
  "text-purple-700",
];

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    api<MeetingDetail>(`/api/meetings/${id}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(reload, [id]);

  async function setJoin(joinEnabled: boolean) {
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/api/meetings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ joinEnabled }),
      });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update join");
    } finally {
      setBusy(false);
    }
  }

  async function cancelMeeting() {
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/api/meetings/${id}`, { method: "DELETE" });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
      setBusy(false);
    }
  }

  if (error && !detail) {
    return (
      <div className="w-full space-y-4">
        <Link href="/dashboard" className="text-sm font-medium text-neutral-500 hover:text-neutral-800">
          ← Meetings
        </Link>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="w-full space-y-4">
        <Link href="/dashboard" className="text-sm font-medium text-neutral-500 hover:text-neutral-800">
          ← Meetings
        </Link>
        <Spinner />
      </div>
    );
  }

  const { meeting, segments, actionItems, reports } = detail;
  const speakers = [...new Set(segments.map((s) => s.speakerName ?? s.speakerLabel))];
  const colorFor = (speaker: string) =>
    speakerColors[speakers.indexOf(speaker) % speakerColors.length];
  const canControlJoin =
    meeting.status === "scheduled" || meeting.status === "bot_dispatched";

  return (
    <div className="w-full space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-neutral-500 hover:text-neutral-800">
          ← Meetings
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950">{meeting.title}</h1>
          <Badge tone={statusTone(meeting.status)}>{meeting.status.replace(/_/g, " ")}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {formatDate(meeting.startsAt)} · {formatDuration(meeting.durationSeconds)} ·{" "}
          {meeting.platform.replace(/_/g, " ")}
        </p>
        {(meeting.error || error) && (
          <p className="mt-2 text-sm text-red-600">{error ?? meeting.error}</p>
        )}
      </div>

      {canControlJoin && (
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Switch
              checked={Boolean(meeting.joinEnabled)}
              disabled={busy}
              onChange={(next) => void setJoin(next)}
              label={meeting.joinEnabled ? "Follac will join" : "Skipping this meeting"}
              description="Turn off to save meeting hours on non-important calls"
            />
            <Button variant="secondary" disabled={busy} onClick={() => void cancelMeeting()}>
              Cancel meeting
            </Button>
          </div>
        </Card>
      )}

      {meeting.recordingUrl && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Recording</h2>
          <a
            href={meeting.recordingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Open recording
          </a>
        </Card>
      )}

      {meeting.status === "processing" && (
        <Card className="border-sky-200 bg-sky-50">
          <p className="text-sm text-sky-950">
            This meeting is being transcribed and analyzed. The report lands in your inbox when done.
          </p>
        </Card>
      )}

      {meeting.summary && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Summary</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-800">{meeting.summary}</p>

          {meeting.keyPoints && meeting.keyPoints.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Key points
              </h3>
              <ul className="mt-2 space-y-1.5">
                {meeting.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-2 text-sm text-neutral-700">
                    <span className="text-brand-600">•</span> {point}
                  </li>
                ))}
              </ul>
            </>
          )}

          {meeting.decisions && meeting.decisions.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Decisions
              </h3>
              <ul className="mt-2 space-y-1.5">
                {meeting.decisions.map((decision, i) => (
                  <li key={i} className="flex gap-2 text-sm text-neutral-700">
                    <span className="text-emerald-600">✓</span> {decision}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {actionItems.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Action items
          </h2>
          <ul className="mt-3 divide-y divide-neutral-100">
            {actionItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm text-neutral-800">{item.description}</p>
                  <p className="text-xs text-neutral-500">
                    {item.owner ?? "Unassigned"}
                    {item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ""}
                  </p>
                </div>
                <Badge tone={statusTone(item.status)}>{item.status.replace(/_/g, " ")}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {meeting.speakerStats && meeting.speakerStats.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Who said what
          </h2>
          <div className="mt-3 space-y-4">
            {meeting.speakerStats.map((stat) => (
              <div key={stat.speaker}>
                <div className="flex items-center justify-between text-sm">
                  <span className={`font-semibold ${colorFor(stat.speaker)}`}>{stat.speaker}</span>
                  <span className="text-neutral-500">{stat.talkTimePercent}% of talk time</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${stat.talkTimePercent}%` }}
                  />
                </div>
                {stat.keyPoints.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {stat.keyPoints.map((point, i) => (
                      <li key={i} className="text-xs text-neutral-600">
                        • {point}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {segments.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Transcript</h2>
          <div className="mt-3 max-h-[32rem] space-y-3 overflow-y-auto pr-2">
            {segments.map((segment) => {
              const speaker = segment.speakerName ?? segment.speakerLabel;
              return (
                <div key={segment.id} className="text-sm">
                  <span className="mr-2 font-mono text-xs text-neutral-400">
                    {msToClock(segment.startMs)}
                  </span>
                  <span className={`font-semibold ${colorFor(speaker)}`}>{speaker}:</span>{" "}
                  <span className="text-neutral-800">{segment.text}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {reports.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Email reports
          </h2>
          <ul className="mt-3 divide-y divide-neutral-100">
            {reports.map((report) => (
              <li key={report.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-neutral-700">
                  {report.type === "full" ? "Full report" : "Executive summary"} → {report.sentTo}
                </span>
                <Badge tone={statusTone(report.status)}>{report.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
