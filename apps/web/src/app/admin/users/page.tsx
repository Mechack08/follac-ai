"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Button, Card, Input, Spinner, statusTone } from "@/components/ui";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  planId: string | null;
  subStatus: string | null;
  trialEndsAt: string | null;
}

const PLAN_OPTIONS = ["trial", "starter", "pro", "business"] as const;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback((q: string) => {
    api<{ users: AdminUser[] }>(`/api/admin/users${q ? `?query=${encodeURIComponent(q)}` : ""}`)
      .then((res) => setUsers(res.users))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => load(""), [load]);

  async function update(id: string, patch: { role?: string; planOverride?: string }) {
    setBusyId(id);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      load(query);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">Search, change roles, override plans.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(query);
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="Search by email or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      {!users ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Override plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-700">{user.planId ?? "—"}</td>
                  <td className="px-4 py-3">
                    {user.subStatus ? (
                      <Badge tone={statusTone(user.subStatus)}>{user.subStatus}</Badge>
                    ) : (
                      <Badge tone="gray">none</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={busyId === user.id}
                      onChange={(e) => void update(user.id, { role: e.target.value })}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      defaultValue=""
                      disabled={busyId === user.id}
                      onChange={(e) => {
                        if (e.target.value) void update(user.id, { planOverride: e.target.value });
                      }}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="">Set plan…</option>
                      {PLAN_OPTIONS.map((plan) => (
                        <option key={plan} value={plan}>
                          {plan}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
