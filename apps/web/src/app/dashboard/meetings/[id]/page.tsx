"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type MeetingDetail } from "@/lib/api";
import {
  Badge,
  Card,
  Spinner,
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
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MeetingDetail>(`/api/meetings/${id}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail) return <Spinner />;

  const { meeting, segments, actionItems, reports } = detail;
  const speakers = [...new Set(segments.map((s) => s.speakerName ?? s.speakerLabel))];
  const colorFor = (speaker: string) =>
    speakerColors[speakers.indexOf(speaker) % speakerColors.length];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
          <Badge tone={statusTone(meeting.status)}>{meeting.status.replace(/_/g, " ")}</Badge>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {formatDate(meeting.startsAt)} · {formatDuration(meeting.durationSeconds)} ·{" "}
          {meeting.platform.replace(/_/g, " ")}
        </p>
        {meeting.error && <p className="mt-2 text-sm text-red-600">{meeting.error}</p>}
      </div>

      {meeting.status === "processing" && (
        <Card className="border-blue-200 bg-blue-50">
          <p className="text-sm text-blue-900">
            This meeting is being transcribed and analyzed. The report lands in your inbox when done.
          </p>
        </Card>
      )}

      {meeting.summary && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Summary</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">{meeting.summary}</p>

          {meeting.keyPoints && meeting.keyPoints.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Key points
              </h3>
              <ul className="mt-2 space-y-1.5">
                {meeting.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-brand-600">•</span> {point}
                  </li>
                ))}
              </ul>
            </>
          )}

          {meeting.decisions && meeting.decisions.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Decisions
              </h3>
              <ul className="mt-2 space-y-1.5">
                {meeting.decisions.map((decision, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-green-600">✓</span> {decision}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {actionItems.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Action items
          </h2>
          <ul className="mt-3 divide-y divide-gray-100">
            {actionItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm text-gray-800">{item.description}</p>
                  <p className="text-xs text-gray-500">
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Who said what
          </h2>
          <div className="mt-3 space-y-4">
            {meeting.speakerStats.map((stat) => (
              <div key={stat.speaker}>
                <div className="flex items-center justify-between text-sm">
                  <span className={`font-semibold ${colorFor(stat.speaker)}`}>{stat.speaker}</span>
                  <span className="text-gray-500">{stat.talkTimePercent}% of talk time</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${stat.talkTimePercent}%` }}
                  />
                </div>
                {stat.keyPoints.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {stat.keyPoints.map((point, i) => (
                      <li key={i} className="text-xs text-gray-600">
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Transcript</h2>
          <div className="mt-3 max-h-[32rem] space-y-3 overflow-y-auto pr-2">
            {segments.map((segment) => {
              const speaker = segment.speakerName ?? segment.speakerLabel;
              return (
                <div key={segment.id} className="text-sm">
                  <span className="mr-2 font-mono text-xs text-gray-400">
                    {msToClock(segment.startMs)}
                  </span>
                  <span className={`font-semibold ${colorFor(speaker)}`}>{speaker}:</span>{" "}
                  <span className="text-gray-800">{segment.text}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {reports.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Email reports
          </h2>
          <ul className="mt-3 divide-y divide-gray-100">
            {reports.map((report) => (
              <li key={report.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">
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
