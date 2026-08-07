import Link from "next/link";
import { MarketingShell } from "@/components/site-chrome";

const endpoints = [
  {
    method: "GET",
    path: "/v1/meetings",
    description: "List your 100 most recent meetings with insights.",
  },
  {
    method: "POST",
    path: "/v1/meetings",
    description: 'Send the Follac bot to a live meeting. Body: { "meeting_url": "https://meet.google.com/..." }',
  },
  {
    method: "GET",
    path: "/v1/meetings/{id}",
    description: "One meeting with summary, decisions, and speaker stats.",
  },
  {
    method: "GET",
    path: "/v1/meetings/{id}/transcript",
    description: "Diarized transcript segments with speaker attribution and timestamps.",
  },
  {
    method: "GET",
    path: "/v1/action-items",
    description: "Action items across all meetings with owners and due dates.",
  },
];

export default function ApiDocsPage() {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
  return (
    <MarketingShell>
      <article className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-950">API reference</h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-neutral-500">
              Programmatic access to meetings, transcripts, and action items. Available on the{" "}
              <strong className="font-semibold text-neutral-800">Business</strong> plan.
            </p>
          </div>
          <Link
            href="/dashboard/developer"
            className="hidden shrink-0 text-sm font-semibold text-brand-600 hover:text-brand-700 sm:inline"
          >
            Get an API key
          </Link>
        </div>

        <h2 className="mt-12 text-lg font-semibold text-neutral-900">Authentication</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Create a key in{" "}
          <Link href="/dashboard/developer" className="font-medium text-brand-600 hover:text-brand-700">
            Dashboard · Developer
          </Link>{" "}
          and pass it as a bearer token:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-neutral-950 p-4 text-sm text-neutral-100">
          {`curl ${apiUrl}/v1/meetings \\\n  -H "Authorization: Bearer flc_live_..."`}
        </pre>

        <h2 className="mt-12 text-lg font-semibold text-neutral-900">Endpoints</h2>
        <div className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {endpoints.map((endpoint) => (
            <div key={`${endpoint.method}-${endpoint.path}`} className="flex items-start gap-4 p-4">
              <span
                className={`mt-0.5 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                  endpoint.method === "GET"
                    ? "bg-sky-50 text-sky-800"
                    : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {endpoint.method}
              </span>
              <div>
                <code className="text-sm font-semibold text-neutral-900">{endpoint.path}</code>
                <p className="mt-1 text-sm text-neutral-500">{endpoint.description}</p>
              </div>
            </div>
          ))}
        </div>

        <h2 className="mt-12 text-lg font-semibold text-neutral-900">Webhooks</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Register HTTPS endpoints in the dashboard to receive <code className="text-neutral-800">meeting.completed</code>,{" "}
          <code className="text-neutral-800">report.ready</code>, and{" "}
          <code className="text-neutral-800">meeting.failed</code> events. Each delivery is signed
          with HMAC-SHA256 in the <code className="text-neutral-800">x-follac-signature</code> header.
        </p>

        <h2 className="mt-12 text-lg font-semibold text-neutral-900">Rate limits</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Business: 300 requests/minute. Responses include{" "}
          <code className="text-neutral-800">x-ratelimit-remaining</code>.
        </p>

        <p className="mt-10 text-sm text-neutral-400">
          Machine-readable spec:{" "}
          <a href={`${apiUrl}/v1/openapi.json`} className="text-brand-600 hover:text-brand-700">
            {apiUrl}/v1/openapi.json
          </a>
        </p>
      </article>
    </MarketingShell>
  );
}
