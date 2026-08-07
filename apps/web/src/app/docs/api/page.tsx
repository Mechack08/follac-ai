import Link from "next/link";

const endpoints = [
  {
    method: "GET",
    path: "/v1/meetings",
    description: "List your 100 most recent meetings with insights.",
  },
  {
    method: "POST",
    path: "/v1/meetings",
    description: "Send the Follac bot to a live meeting. Body: { \"meeting_url\": \"https://meet.google.com/...\" }",
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
    <main className="min-h-screen bg-white">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-xl font-bold text-brand-600">
          Follac AI
        </Link>
        <Link href="/dashboard/developer" className="text-sm font-medium text-gray-600 hover:text-gray-900">
          Get an API key →
        </Link>
      </nav>

      <article className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900">API reference</h1>
        <p className="mt-3 text-gray-600">
          The Follac REST API gives you programmatic access to meetings, transcripts, and action
          items. Available on the <strong>Business</strong> plan.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">Authentication</h2>
        <p className="mt-2 text-sm text-gray-600">
          Create a key in{" "}
          <Link href="/dashboard/developer" className="text-brand-600 hover:underline">
            Dashboard → Developer
          </Link>{" "}
          and pass it as a bearer token:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
          {`curl ${apiUrl}/v1/meetings \\\n  -H "Authorization: Bearer flc_live_..."`}
        </pre>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">Endpoints</h2>
        <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {endpoints.map((endpoint) => (
            <div key={`${endpoint.method}-${endpoint.path}`} className="flex items-start gap-4 p-4">
              <span
                className={`mt-0.5 rounded px-2 py-0.5 font-mono text-xs font-bold ${
                  endpoint.method === "GET" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
                }`}
              >
                {endpoint.method}
              </span>
              <div>
                <code className="text-sm font-semibold text-gray-900">{endpoint.path}</code>
                <p className="mt-1 text-sm text-gray-600">{endpoint.description}</p>
              </div>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">Webhooks</h2>
        <p className="mt-2 text-sm text-gray-600">
          Register HTTPS endpoints in the dashboard to receive <code>meeting.completed</code>,{" "}
          <code>report.ready</code>, and <code>meeting.failed</code> events. Each delivery is signed
          with HMAC-SHA256 in the <code>x-follac-signature</code> header using your endpoint secret.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">Rate limits</h2>
        <p className="mt-2 text-sm text-gray-600">
          Business: 300 requests/minute. Responses include <code>x-ratelimit-remaining</code>.
        </p>

        <p className="mt-10 text-sm text-gray-500">
          Machine-readable spec:{" "}
          <a href={`${apiUrl}/v1/openapi.json`} className="text-brand-600 hover:underline">
            {apiUrl}/v1/openapi.json
          </a>
        </p>
      </article>
    </main>
  );
}
