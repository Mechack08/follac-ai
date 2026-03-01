# Follac AI

> **Follow → Understand → Act**

A context-aware AI browser extension that observes user workflows and proactively assists — without requiring prompts.

---

## What is Follac AI?

Follac AI is **not a chatbot**. It is a background intelligence layer that:

- Detects where the user is working (Gmail, Google Docs, LinkedIn)
- Infers what task they are performing
- Predicts useful actions without being asked
- Presents ranked suggestions — and executes only with approval

---

## Monorepo Structure

```
follac-ai/
├── apps/
│   ├── extension/          # Chrome Extension (MV3, Vite, React, Tailwind)
│   └── server/             # Node.js AI gateway (Fastify + OpenAI)
│
├── packages/
│   ├── shared/             # Core types, constants, utilities
│   ├── platform-adapters/  # Gmail, Docs, LinkedIn adapters
│   ├── agents/             # Multi-agent system
│   ├── ui/                 # Shared React UI components
│   └── memory/             # Memory system (Phase 5 placeholder)
│
├── docs/                   # Architecture documentation
├── package.json            # pnpm workspaces root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### Package Responsibilities

| Package | Role |
|---|---|
| `@follac/shared` | All cross-package types, constants, utilities. Zero dependencies. |
| `@follac/platform-adapters` | DOM extraction + context detection per platform. Adapter pattern. |
| `@follac/agents` | Multi-agent system with Orchestrator. Builds prompts, calls server. |
| `@follac/ui` | Shared React components (overlay, popup). Shadow DOM compatible. |
| `@follac/memory` | Placeholder for Phase 5 memory/personalization system. |
| `@follac/extension` | Chrome Extension MV3. Background SW, content scripts, popup. |
| `@follac/server` | Fastify API gateway. Owns API key. Calls OpenAI. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome MV3, TypeScript, Vite, React 18, TailwindCSS |
| UI Isolation | Shadow DOM (styles can't leak into/from host page) |
| Server | Node.js 20, Fastify, Zod |
| AI | OpenAI (gpt-4o), OpenAI-compatible interface |
| Package Manager | pnpm workspaces |
| Type System | TypeScript 5.4 strict mode throughout |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm`)

### Install

```bash
pnpm install
```

### Configure

```bash
cp apps/server/.env.example apps/server/.env
# Edit apps/server/.env and add your OPENAI_API_KEY
```

### Develop

```bash
# Start both extension (watch) and server
pnpm dev

# Or individually:
pnpm dev:extension   # Vite watch mode → apps/extension/dist/
pnpm dev:server      # tsx watch → http://localhost:3001
```

### Build Extension

```bash
pnpm build:extension
# Output: apps/extension/dist/
# Load as unpacked extension in chrome://extensions
```

---

## Architecture

### Communication Flow

```
User opens Gmail
    │
    ▼
Content Script loads
    │
    ├─ PlatformDetector initializes GmailAdapter
    ├─ GmailAdapter.detectContext() → ContextObject
    │
    ▼
Content Script POSTs to /api/orchestrate
    │
    ├─ ContextAgent  → refines intent
    ├─ ActionAgent   → ranks proposed actions
    └─ ResearchAgent → background info (optional, parallel)
    │
    ▼
Server returns { proposedActions }
    │
    ▼
OverlayManager renders actions in Shadow DOM
    │
    ▼
User clicks "Run →" (APPROVAL REQUIRED)
    │
    ▼
Content Script POSTs to /api/execute
    │
    ├─ ExecutionAgent generates content
    │
    ▼
ExecutionRunner writes to DOM (Gmail compose, etc.)
```

### Platform Adapter Interface

```typescript
interface PlatformAdapter {
  canHandle(url: string): boolean;
  detectContext(): Promise<ContextObject>;
  extractData(): Promise<Record<string, unknown>>;
  proposeActions(context: ContextObject): Promise<ProposedAction[]>;
  teardown(): void;
}
```

Adding a new platform (e.g. Notion):
1. Create `packages/platform-adapters/src/notion/notion.adapter.ts`
2. Extend `BaseAdapter`, implement the interface
3. Register in `apps/extension/src/content/platform-detector.ts`
4. No other changes needed.

### Agent Pipeline

```
ContextAgent → ActionAgent → (ResearchAgent) → ExecutionAgent
```

All agents are loosely coupled via `AgentRequest`/`AgentResponse` envelopes.
The `AgentOrchestrator` wires them — agents never call each other directly.

---

## MVP Roadmap

### Phase 1 — Foundation ✅
- [ ] Monorepo setup (pnpm workspaces)
- [ ] Core type system (`@follac/shared`)
- [ ] Platform adapter interface
- [ ] Agent architecture
- [ ] Extension scaffold (MV3)
- [ ] Server scaffold (Fastify)

### Phase 2 — Gmail Integration
- [ ] GmailAdapter DOM extraction
- [ ] Thread summarization
- [ ] Reply draft generation
- [ ] Task extraction from emails
- [ ] End-to-end Gmail → overlay flow

### Phase 3 — Google Docs Integration
- [ ] DocsAdapter DOM extraction
- [ ] Document summarization
- [ ] Selected text rewrite
- [ ] Task extraction from documents

### Phase 4 — LinkedIn Integration
- [ ] LinkedInAdapter DOM extraction
- [ ] Outreach message composition
- [ ] Job application drafting
- [ ] Company research cards

### Phase 5 — Agent Intelligence
- [ ] `@follac/memory` implementation
- [ ] User preference learning
- [ ] Action history tracking
- [ ] Confidence score personalization
- [ ] Multi-step agent chains

---

## Engineering Principles

1. **No DOM writes without approval** — ExecutionRunner only acts after explicit user confirmation
2. **Platform isolation** — Adapters are fully isolated. A bug in LinkedIn adapter can't affect Gmail
3. **API key security** — Key lives exclusively on the server. The extension never sees it
4. **Shadow DOM** — Follac UI is completely isolated from the host page's CSS
5. **Strict TypeScript** — `noImplicitAny`, `strict: true` enforced everywhere
6. **Structured JSON from LLM** — All agent responses use OpenAI's `response_format: json_object`

---

## Contributing

1. Clone the repo
2. `pnpm install`
3. Copy `.env.example` → `.env` in `apps/server/`
4. Run `pnpm dev`
5. Open `chrome://extensions` → Load unpacked → select `apps/extension/dist/`

For new platform support, see [docs/adding-a-platform.md](docs/adding-a-platform.md).

---

## License

MIT — See LICENSE file.
