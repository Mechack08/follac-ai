"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ActionItem } from "@/lib/api";
import { Badge, EmptyState, Spinner, formatDate, statusTone } from "@/components/ui";

const NEXT_STATUS: Record<ActionItem["status"], ActionItem["status"]> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
  dismissed: "open",
};

export default function ActionItemsPage() {
  const [items, setItems] = useState<ActionItem[] | null>(null);

  useEffect(() => {
    api<{ actionItems: ActionItem[] }>("/api/action-items")
      .then((res) => setItems(res.actionItems))
      .catch(() => setItems([]));
  }, []);

  async function cycle(item: ActionItem) {
    const status = NEXT_STATUS[item.status];
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, status } : i)) ?? null);
    await api(`/api/action-items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).catch(() => {
      // Revert on failure
      setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)) ?? null);
    });
  }

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-950">Action items</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything you and your teams committed to, across all meetings. Click a status to advance it.
        </p>
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          title="No action items yet"
          subtitle="When Follac hears commitments in your meetings, they'll be tracked here with owners and due dates."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">From meeting</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="max-w-md px-4 py-3 text-neutral-900">{item.description}</td>
                  <td className="px-4 py-3 text-neutral-600">{item.owner ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/meetings/${item.meetingId}`}
                      className="text-brand-600 hover:underline"
                    >
                      {item.meetingTitle ?? "View"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{formatDate(item.dueDate)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => void cycle(item)} title="Click to advance">
                      <Badge tone={statusTone(item.status)}>{item.status.replace(/_/g, " ")}</Badge>
                    </button>
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
