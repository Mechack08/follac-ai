"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, Spinner, statusTone } from "@/components/ui";

interface Metrics {
  users: { total: number; newThisMonth: number };
  subscriptions: Array<{ planId: string; status: string; count: number }>;
  mrrCents: number;
  meetingsLast30Days: Array<{ status: string; count: number }>;
  recordedHoursLast30Days: number;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </Card>
  );
}

export default function AdminOverviewPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Metrics>("/api/admin/metrics")
      .then(setMetrics)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load metrics"));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!metrics) return <Spinner />;

  const meetingsProcessed =
    metrics.meetingsLast30Days.find((m) => m.status === "completed")?.count ?? 0;
  const meetingsFailed = metrics.meetingsLast30Days.find((m) => m.status === "failed")?.count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total users"
          value={String(metrics.users.total)}
          sub={`+${metrics.users.newThisMonth} in the last 30 days`}
        />
        <Stat label="MRR" value={`$${(metrics.mrrCents / 100).toLocaleString()}`} />
        <Stat
          label="Meetings processed (30d)"
          value={String(meetingsProcessed)}
          sub={meetingsFailed > 0 ? `${meetingsFailed} failed` : "No failures"}
        />
        <Stat label="Hours recorded (30d)" value={`${metrics.recordedHoursLast30Days}h`} />
      </div>

      <Card>
        <h2 className="text-base font-semibold text-gray-900">Active subscriptions by plan</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="py-2">Plan</th>
              <th className="py-2">Status</th>
              <th className="py-2">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {metrics.subscriptions.map((row, i) => (
              <tr key={i}>
                <td className="py-2 font-medium capitalize text-gray-900">{row.planId}</td>
                <td className="py-2">
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                </td>
                <td className="py-2 text-gray-700">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-gray-900">Meetings pipeline (30 days)</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {metrics.meetingsLast30Days.map((row) => (
            <div key={row.status} className="rounded-lg border border-gray-200 px-4 py-2">
              <Badge tone={statusTone(row.status)}>{row.status.replace(/_/g, " ")}</Badge>
              <p className="mt-1 text-xl font-bold text-gray-900">{row.count}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
