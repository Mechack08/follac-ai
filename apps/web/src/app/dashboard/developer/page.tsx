"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Input, Spinner, formatDate } from "@/components/ui";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export default function DeveloperPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[] | null>(null);
  const [planBlocked, setPlanBlocked] = useState(false);

  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);

  useEffect(() => {
    api<{ keys: ApiKey[] }>("/api/developer/keys")
      .then((res) => setKeys(res.keys))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setPlanBlocked(true);
        setKeys([]);
      });
    api<{ endpoints: WebhookEndpoint[] }>("/api/developer/webhooks")
      .then((res) => setEndpoints(res.endpoints))
      .catch(() => setEndpoints([]));
  }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    const created = await api<{ id: string; key: string; prefix: string }>("/api/developer/keys", {
      method: "POST",
      body: JSON.stringify({ name: keyName }),
    });
    setNewKey(created.key);
    setKeyName("");
    const res = await api<{ keys: ApiKey[] }>("/api/developer/keys");
    setKeys(res.keys);
  }

  async function revokeKey(id: string) {
    await api(`/api/developer/keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev?.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)) ?? null);
  }

  async function createWebhook(e: React.FormEvent) {
    e.preventDefault();
    const created = await api<{ id: string; secret: string }>("/api/developer/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: webhookUrl, events: ["meeting.completed", "report.ready", "meeting.failed"] }),
    });
    setNewSecret(created.secret);
    setWebhookUrl("");
    const res = await api<{ endpoints: WebhookEndpoint[] }>("/api/developer/webhooks");
    setEndpoints(res.endpoints);
  }

  async function deleteWebhook(id: string) {
    await api(`/api/developer/webhooks/${id}`, { method: "DELETE" });
    setEndpoints((prev) => prev?.filter((e) => e.id !== id) ?? null);
  }

  if (planBlocked) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Developer</h1>
        <EmptyState
          title="API access is a Business feature"
          subtitle="Upgrade to the Business plan to create API keys, receive webhooks, and integrate Follac with your own tools."
          action={<Button href="/dashboard/billing">Upgrade to Business</Button>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Developer</h1>
        <p className="mt-1 text-sm text-gray-500">
          API keys and webhooks.{" "}
          <Link href="/docs/api" className="text-brand-600 hover:underline">
            Read the API docs
          </Link>
        </p>
      </div>

      <Card>
        <h2 className="text-base font-semibold text-gray-900">API keys</h2>
        {newKey && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-900">
              Copy this key now — it will not be shown again:
            </p>
            <code className="mt-1 block break-all text-sm font-semibold text-amber-950">{newKey}</code>
          </div>
        )}
        <form onSubmit={createKey} className="mt-4 flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Key name (e.g. Zapier integration)"
              required
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
          </div>
          <Button type="submit">Create key</Button>
        </form>
        {!keys ? (
          <Spinner />
        ) : keys.length > 0 ? (
          <ul className="mt-4 divide-y divide-gray-100">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {key.name} <code className="ml-1 text-xs text-gray-500">{key.prefix}…</code>
                  </p>
                  <p className="text-xs text-gray-500">
                    Last used {formatDate(key.lastUsedAt)}
                  </p>
                </div>
                {key.revokedAt ? (
                  <Badge tone="red">revoked</Badge>
                ) : (
                  <Button variant="secondary" onClick={() => void revokeKey(key.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-gray-900">Webhook endpoints</h2>
        <p className="mt-1 text-xs text-gray-500">
          We POST signed events (meeting.completed, report.ready, meeting.failed) to your HTTPS endpoint.
        </p>
        {newSecret && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-900">
              Signing secret — verify the <code>x-follac-signature</code> header with it:
            </p>
            <code className="mt-1 block break-all text-sm font-semibold text-amber-950">{newSecret}</code>
          </div>
        )}
        <form onSubmit={createWebhook} className="mt-4 flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="https://example.com/webhooks/follac"
              type="url"
              required
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>
          <Button type="submit">Add endpoint</Button>
        </form>
        {endpoints && endpoints.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{endpoint.url}</p>
                  <p className="text-xs text-gray-500">{endpoint.events.join(", ")}</p>
                </div>
                <Button variant="secondary" onClick={() => void deleteWebhook(endpoint.id)}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
