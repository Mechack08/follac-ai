# Follac AI

> **Follow → Understand → Act**

Follac is a full work assistant. Its flagship feature is a meeting assistant: a bot joins your
Google Meet / Zoom / Teams calls, transcribes **who said what**, extracts **decisions and action
items**, and emails you **full + summary reports** minutes after the call. It also keeps the
original in-page browser assistant (Gmail, Google Docs, LinkedIn).

Monetized as a SaaS: 7-day free trial (no card), then Starter / Pro / Business plans via Stripe,
with an admin panel and a public REST API.

---

## Monorepo Structure

```
follac-ai/
├── apps/
│   ├── web/                # Next.js: landing, pricing, dashboard, admin panel
│   ├── server/             # Fastify API: auth, meetings, billing, public API, webhooks
│   ├── worker/             # BullMQ worker: transcription, analysis, report emails
│   └── extension/          # Chrome Extension (MV3) — in-page assistant
│
├── packages/
│   ├── db/                 # PostgreSQL schema (Drizzle), plan catalog, job contracts
│   ├── emails/             # React Email templates (reports + lifecycle)
│   ├── meeting-intelligence/ # Transcript analysis: summary, decisions, action items
│   ├── shared/             # Cross-package types, constants, utilities
│   ├── platform-adapters/  # Gmail, Docs, LinkedIn DOM adapters
│   ├── agents/             # In-page assistant agents (Context/Action/Research/Execution)
│   ├── ui/                 # Shared React UI (extension overlay)
│   └── memory/             # Personalization placeholder
│
├── docker-compose.yml      # Local PostgreSQL + Redis
└── docs/
```

## How the meeting pipeline works

```
Calendar sync (server scheduler, every 5 min)
    └─► upcoming meetings with video links → meetings table (status: scheduled)
Bot dispatch (2 min before start, entitlements checked)
    └─► Recall.ai bot joins the call and records        (status: bot_dispatched → recording)
Recall webhook: recording ready
    └─► server stores recording URL, enqueues job       (status: processing)
Worker: meeting-processing queue
    ├─► Deepgram diarized transcription (who said what)
    ├─► meeting-intelligence (GPT): summary, key points, decisions,
    │   action items with owners, speaker-name resolution, talk-time stats
    └─► persists everything, records usage              (status: completed)
Worker: reports queue
    └─► renders React Email full + summary reports, sends via Resend
Worker: webhook-delivery queue
    └─► signed events (meeting.completed, report.ready) to customer endpoints
```

## Tech Stack

| Layer | Technology |
|---|---|
| Web app | Next.js 15, React 19, Tailwind v4 |
| API server | Fastify 4, better-auth (email/password + Google), Zod |
| Database | PostgreSQL + Drizzle ORM |
| Queue | Redis + BullMQ |
| Meeting bots | Recall.ai (behind a `MeetingBotProvider` interface) |
| Transcription | Deepgram Nova (diarized), swappable |
| AI | OpenAI gpt-4o / gpt-4o-mini |
| Billing | Stripe Checkout + Customer Portal + webhooks |
| Email | Resend + React Email |
| Extension | Chrome MV3, Vite, Shadow DOM |

## Plans

| Plan | Price | Limits | Extras |
|---|---|---|---|
| Trial | Free, 7 days | 5 meetings | Full Pro features, no card |
| Starter | $12/mo | 8 meeting-hours/mo | Summaries + email reports, 30-day history |
| Pro | $29/mo | 30 meeting-hours/mo | Action items, speaker analytics, extension actions |
| Business | $59/user/mo | Unlimited | Team workspace, REST API, webhooks |

Enforcement lives in one place: `apps/server/src/lib/entitlements.ts`.

---

## Getting Started

### Prerequisites

- Node.js ≥ 20, pnpm ≥ 9
- Docker (or local PostgreSQL 15+ and Redis 7+)

### 1. Install & start infrastructure

```bash
pnpm install
docker compose up -d          # PostgreSQL :5432 + Redis :6379
```

### 2. Configure

```bash
cp apps/server/.env.example apps/server/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example    apps/web/.env.local
```

Fill in at minimum: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `OPENAI_API_KEY`.
For the full meeting pipeline you also need `RECALL_API_KEY`, `DEEPGRAM_API_KEY`,
`RESEND_API_KEY`, and Google OAuth credentials (`GOOGLE_CLIENT_ID`/`SECRET` with redirect URIs
`{API_URL}/api/auth/callback/google` and `{API_URL}/api/calendar/callback`).
For billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the three `STRIPE_PRICE_*` ids.

### 3. Migrate + seed

```bash
pnpm db:migrate   # applies packages/db/migrations
pnpm db:seed      # seeds the plan catalog (reads STRIPE_PRICE_* if set)
```

### 4. Run

```bash
pnpm dev:server   # API on :3001
pnpm dev:worker   # queue consumers
pnpm dev:web      # web app on :3000
pnpm dev:extension  # extension build (load apps/extension/dist in chrome://extensions)
```

Sign up at `http://localhost:3000/signup` — a 7-day trial is provisioned automatically.
To make yourself admin:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

Then open `http://localhost:3000/admin`.

### Webhooks in development

- **Stripe**: `stripe listen --forward-to localhost:3001/api/webhooks/stripe`
- **Recall**: point the webhook URL in the Recall dashboard at a tunnel
  (`ngrok http 3001`) → `/api/webhooks/recall`

---

## Public API

Business-plan users create keys in **Dashboard → Developer** and call:

```bash
curl https://api.your-domain.com/v1/meetings \
  -H "Authorization: Bearer flc_live_..."
```

Endpoints: `/v1/meetings` (GET/POST), `/v1/meetings/:id`, `/v1/meetings/:id/transcript`,
`/v1/action-items`. Spec: `/v1/openapi.json`. Docs page: `/docs/api` in the web app.
Outbound webhooks are HMAC-signed (`x-follac-signature: sha256=...`).

## Deployment

- **apps/web** → Vercel (set `NEXT_PUBLIC_API_URL`)
- **apps/server** + **apps/worker** → Railway / Fly.io / Render (two processes; both need
  `DATABASE_URL` + `REDIS_URL`)
- Managed Postgres (Neon/Supabase/RDS) + managed Redis (Upstash/Elasticache)
- Set `NODE_ENV=production` — session cookies switch to `SameSite=None; Secure` so the
  extension and web app can talk to the API cross-origin
- Recommended next step: add Sentry to server + worker for error tracking

## Engineering Principles

1. **No DOM writes without approval** — the extension executes only after explicit confirmation
2. **One entitlements module** — every metered action checks the same code path
3. **API keys are hashed** — plaintext shown once; only SHA-256 stored
4. **Provider isolation** — Recall and Deepgram sit behind narrow interfaces and can be swapped
5. **Strict TypeScript everywhere** — the whole workspace type-checks with `strict: true`
6. **Structured JSON from LLMs** — `response_format: json_object` for all analysis

## License

MIT — See LICENSE file.
