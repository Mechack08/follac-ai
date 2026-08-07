"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, EmptyState, Spinner, formatDate } from "@/components/ui";

interface Failure {
  id: string;
  title: string;
  userEmail: string;
  platform: string;
  error: string | null;
  updatedAt: string;
}

interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export default function AdminPipelinePage() {
  const [failures, setFailures] = useState<Failure[] | null>(null);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);

  useEffect(() => {
    api<{ failures: Failure[] }>("/api/admin/failures")
      .then((res) => setFailures(res.failures))
      .catch(() => setFailures([]));
    api<{ logs: AuditLog[] }>("/api/admin/audit-logs")
      .then((res) => setLogs(res.logs))
      .catch(() => setLogs([]));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Pipeline health</h1>

      <Card>
        <h2 className="text-base font-semibold text-gray-900">Failed meetings</h2>
        {!failures ? (
          <Spinner />
        ) : failures.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No failures. The pipeline is healthy.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-2">Meeting</th>
                <th className="py-2">User</th>
                <th className="py-2">Error</th>
                <th className="py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {failures.map((failure) => (
                <tr key={failure.id}>
                  <td className="py-2 font-medium text-gray-900">{failure.title}</td>
                  <td className="py-2 text-gray-600">{failure.userEmail}</td>
                  <td className="max-w-sm py-2 text-xs text-red-700">{failure.error ?? "Unknown"}</td>
                  <td className="py-2 text-gray-600">{formatDate(failure.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-gray-900">Audit log</h2>
        {!logs ? (
          <Spinner />
        ) : logs.length === 0 ? (
          <EmptyState title="No entries" subtitle="Admin actions and system events appear here." />
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{log.action}</code>
                  {log.targetType && (
                    <span className="ml-2 text-gray-500">
                      {log.targetType} {log.targetId}
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-500">{formatDate(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
