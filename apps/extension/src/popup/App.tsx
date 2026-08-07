import { useEffect, useState } from "react";
import type { ContextObject, ProposedAction } from "@follac/shared";

type TabState = {
  context: ContextObject | null;
  actions: ProposedAction[];
  isLoading: boolean;
};

type AuthUser = { id: string; email: string; name: string };
type AuthState = { user: AuthUser | null; isLoading: boolean };

function sendToBackground<T>(topic: string, payload: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { topic, payload, timestamp: new Date().toISOString() },
      (response: { ok: boolean; data?: T; error?: string }) => {
        if (response?.ok) resolve(response.data as T);
        else reject(new Error(response?.error ?? "Unknown error"));
      },
    );
  });
}

const PLATFORM_LABELS: Record<string, string> = {
  gmail: "Gmail",
  "google-docs": "Google Docs",
  linkedin: "LinkedIn",
  unknown: "Unknown platform",
};

const PLATFORM_COLORS: Record<string, string> = {
  gmail: "bg-red-500",
  "google-docs": "bg-blue-500",
  linkedin: "bg-blue-700",
  unknown: "bg-gray-500",
};

export default function PopupApp() {
  const [state, setState] = useState<TabState>({
    context: null,
    actions: [],
    isLoading: true,
  });
  const [auth, setAuth] = useState<AuthState>({ user: null, isLoading: true });

  useEffect(() => {
    sendToBackground<{ user: AuthUser | null }>("auth:get-session")
      .then((data) => setAuth({ user: data.user, isLoading: false }))
      .catch(() => setAuth({ user: null, isLoading: false }));
  }, []);

  useEffect(() => {
    // Query active tab to load stored context
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab?.id) {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      const tabId = tab.id;
      const stored = await chrome.storage.session.get([
        `follac_context_${tabId}`,
        `follac_actions_${tabId}`,
      ]);

      setState({
        context: (stored[`follac_context_${tabId}`] as ContextObject) ?? null,
        actions: (stored[`follac_actions_${tabId}`] as ProposedAction[]) ?? [],
        isLoading: false,
      });
    });
  }, []);

  const sendToContent = (message: object) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, message);
    });
  };

  const handleApprove = (action: ProposedAction) => {
    sendToContent({ topic: "action:approved", payload: action, timestamp: new Date().toISOString() });
  };

  if (state.isLoading || auth.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-slate-900">
        <div className="h-6 w-6 rounded-full border-2 border-follac-500 border-t-transparent animate-spin" />
        <p className="mt-3 text-sm text-slate-400">Loading context...</p>
      </div>
    );
  }

  if (!auth.user) {
    return <SignInView onSignedIn={(user) => setAuth({ user, isLoading: false })} />;
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-follac-600">
          <span className="text-white text-xs font-bold">F</span>
        </div>
        <span className="font-semibold text-sm tracking-tight">Follac AI</span>
        {state.context && (
          <span
            className={`ml-auto text-xs px-2 py-0.5 rounded-full text-white ${PLATFORM_COLORS[state.context.platform] ?? "bg-gray-600"}`}
          >
            {PLATFORM_LABELS[state.context.platform] ?? state.context.platform}
          </span>
        )}
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {!state.context ? (
          <EmptyState />
        ) : (
          <>
            <ContextCard context={state.context} />
            {state.actions.length > 0 && (
              <ActionList actions={state.actions} onApprove={handleApprove} />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-4 py-2 border-t border-slate-800">
        <p className="text-xs text-slate-500 truncate">{auth.user.email}</p>
        <button
          onClick={() => {
            void sendToBackground("auth:sign-out").then(() =>
              setAuth({ user: null, isLoading: false }),
            );
          }}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Sign out
        </button>
      </footer>
    </div>
  );
}

// ─── Sign-in view ─────────────────────────────────────────────────────────────

function SignInView({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    sendToBackground<{ user: AuthUser }>("auth:sign-in", { email, password })
      .then((data) => onSignedIn(data.user))
      .catch((err: Error) => {
        setError(err.message);
        setBusy(false);
      });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-follac-600">
          <span className="text-white text-xs font-bold">F</span>
        </div>
        <span className="font-semibold text-sm tracking-tight">Follac AI</span>
      </header>
      <main className="flex-1 px-4 py-4">
        <p className="text-sm font-medium text-slate-200">Sign in to your account</p>
        <p className="mt-1 text-xs text-slate-500">
          The in-page assistant uses your Follac subscription.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-follac-500 focus:outline-none"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-follac-500 focus:outline-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 text-xs font-semibold rounded-lg bg-follac-600 hover:bg-follac-500 disabled:opacity-50 text-white transition-colors"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          No account?{" "}
          <a
            href="http://localhost:3000/signup"
            target="_blank"
            rel="noreferrer"
            className="text-follac-400 hover:underline"
          >
            Start a free trial
          </a>
        </p>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-3xl mb-3">🔍</div>
      <p className="text-sm text-slate-300 font-medium">No context detected</p>
      <p className="text-xs text-slate-500 mt-1">
        Navigate to Gmail, Google Docs, or LinkedIn to start.
      </p>
    </div>
  );
}

function ContextCard({ context }: { context: ContextObject }) {
  const confidence = Math.round(context.confidenceScore * 100);
  return (
    <div className="rounded-follac bg-slate-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          Detected Activity
        </span>
        <span className="text-xs text-follac-400 font-medium">{confidence}% confident</span>
      </div>
      <p className="text-sm text-slate-200">{context.detectedActivity}</p>
      <div className="pt-1 border-t border-slate-700">
        <span className="text-xs text-slate-400">Intent: </span>
        <span className="text-xs text-slate-300">{context.inferredIntent}</span>
      </div>
    </div>
  );
}

function ActionList({
  actions,
  onApprove,
}: {
  actions: ProposedAction[];
  onApprove: (action: ProposedAction) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        Suggested Actions
      </p>
      {actions.map((action) => (
        <ActionCard key={action.id} action={action} onApprove={onApprove} />
      ))}
    </div>
  );
}

function ActionCard({
  action,
  onApprove,
}: {
  action: ProposedAction;
  onApprove: (action: ProposedAction) => void;
}) {
  const confidence = Math.round(action.confidence * 100);

  return (
    <div className="rounded-follac bg-slate-800 border border-slate-700 p-3 space-y-2 hover:border-follac-600 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-100">{action.title}</p>
        <span className="flex-shrink-0 text-xs text-slate-500">{confidence}%</span>
      </div>
      <p className="text-xs text-slate-400">{action.description}</p>
      <button
        onClick={() => onApprove(action)}
        className="w-full py-1.5 text-xs font-semibold rounded-lg bg-follac-600 hover:bg-follac-500 text-white transition-colors"
      >
        Run this action →
      </button>
    </div>
  );
}
