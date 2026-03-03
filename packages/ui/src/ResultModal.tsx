import { useState, useEffect, useCallback } from "react";
import type { ProposedAction } from "@follac/shared";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Task {
  task: string;
  owner?: string;
  dueDate?: string | null;
  priority?: "high" | "medium" | "low";
}

export interface ResultEntry {
  id: string;
  action: ProposedAction;
  output: string;
}

// ─── Constants ────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, string> = {
  "summarize-thread": "📋",
  "summarize-document": "📄",
  "extract-tasks": "✅",
  "research-person": "🔍",
  "draft-email": "✍️",
  "generate-reply": "↩️",
  "compose-linkedin-message": "💬",
  "rewrite-paragraph": "🔄",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400 bg-red-400/10 border border-red-500/30",
  medium: "text-amber-400 bg-amber-400/10 border border-amber-500/30",
  low: "text-slate-400 bg-slate-600/40 border border-slate-600",
};

/**
 * Action types that produce display-only results (no DOM injection).
 * These are shown in the ResultModal popup.
 */
export const DISPLAY_ACTION_TYPES = new Set([
  "summarize-thread",
  "summarize-document",
  "extract-tasks",
  "research-person",
  "rewrite-paragraph",
]);

export const isDisplayAction = (type: string): boolean =>
  DISPLAY_ACTION_TYPES.has(type);

// ─── Helpers ──────────────────────────────────────────────────────────────

function tryParseTasks(output: string): Task[] | null {
  try {
    const match = output.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as Task[];
    return null;
  } catch {
    return null;
  }
}

// ─── Inline Markdown Renderer ─────────────────────────────────────────────

function renderInline(text: string): (string | JSX.Element)[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        const clean = line.trim();

        // Bullet: • - *
        const bulletMatch = clean.match(/^[•\-*]\s+(.*)/);
        if (bulletMatch) {
          return (
            <div key={i} className="flex items-start gap-2.5 pl-1">
              <span className="text-follac-400 text-xs mt-[2px] flex-shrink-0 select-none">›</span>
              <span className="text-[13px] text-slate-300 leading-relaxed">
                {renderInline(bulletMatch[1] ?? "")}
              </span>
            </div>
          );
        }

        // Section header: **Foo:** or **Foo**
        if (clean.match(/^\*\*[^*]+\*\*:?\s*$/)) {
          const label = clean.replace(/\*\*/g, "").replace(/:$/, "");
          return (
            <p
              key={i}
              className="text-[12px] font-semibold text-slate-100 uppercase tracking-wide mt-4 first:mt-0 pb-1 border-b border-slate-700"
            >
              {label}
            </p>
          );
        }

        // Normal paragraph
        return (
          <p key={i} className="text-[13px] text-slate-300 leading-relaxed">
            {renderInline(clean)}
          </p>
        );
      })}
    </div>
  );
}

// ─── Task List ────────────────────────────────────────────────────────────

function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <div className="space-y-2">
      {tasks.map((task, i) => (
        <div
          key={i}
          className="rounded-lg bg-slate-800/70 border border-slate-700 p-3 space-y-2"
        >
          <p className="text-[13px] text-slate-100 leading-snug">{task.task}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {task.owner && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-700/80 rounded-full px-2.5 py-0.5">
                <span>👤</span>
                <span>{task.owner}</span>
              </span>
            )}
            {task.dueDate && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-700/80 rounded-full px-2.5 py-0.5">
                <span>📅</span>
                <span>{task.dueDate}</span>
              </span>
            )}
            {task.priority && (
              <span
                className={`text-[11px] rounded-full px-2.5 py-0.5 font-medium ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS["low"]}`}
              >
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} priority
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Single Modal Card ────────────────────────────────────────────────────

function ModalCard({
  entry,
  onClose,
}: {
  entry: ResultEntry;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { action, output } = entry;
  const icon = ACTION_ICONS[action.type] ?? "⚡";
  const isError = output.startsWith("⚠");
  const tasks = action.type === "extract-tasks" ? tryParseTasks(output) : null;

  const handleCopy = () => {
    void navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 2147483646, pointerEvents: "all" }}
    >
      {/* Backdrop — very subtle, click to close */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        className="relative w-full max-w-[560px] mx-4 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden animate-slide-in"
        style={{ maxHeight: "82vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 bg-slate-800 border-b border-slate-700 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-follac-600/20 border border-follac-500/30 flex items-center justify-center text-base flex-shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{action.title}</p>
            <p className="text-[11px] text-follac-400 mt-0.5">Follac AI · Result</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex-shrink-0 text-sm font-bold"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Content (scrollable) ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {isError ? (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-400/5 border border-amber-500/30">
              <span className="text-lg flex-shrink-0">⚠️</span>
              <p className="text-[13px] text-amber-300 leading-relaxed">
                {output.replace(/^⚠\s*/, "")}
              </p>
            </div>
          ) : tasks ? (
            <TaskList tasks={tasks} />
          ) : (
            <MarkdownContent text={output} />
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        {!isError && (
          <div className="px-5 py-3 bg-slate-800/60 border-t border-slate-700/60 flex-shrink-0 space-y-2">
            <button
              onClick={handleCopy}
              className="w-full py-2 text-[12px] font-medium rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-follac-500/50 text-slate-300 hover:text-white transition-all"
            >
              {copied ? "✓  Copied to clipboard" : "📋  Copy"}
            </button>
            {action.type === "rewrite-paragraph" && (
              <p className="text-center text-[11px] text-slate-500">
                💡 Rewritten text copied to clipboard — select your original text and press{" "}
                <kbd className="bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-[10px] text-slate-300">
                  ⌘V
                </kbd>{" "}
                /{" "}
                <kbd className="bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-[10px] text-slate-300">
                  Ctrl+V
                </kbd>{" "}
                to replace it
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ResultModalContainer ─────────────────────────────────────────────────

/**
 * ResultModalContainer — manages the stack of result modals.
 *
 * Listens for `follac:result` events directly (not routed through the
 * sidebar overlay). Only one modal is shown at a time — the latest.
 * Previous results stay in stack; the user can close and see the previous one.
 *
 * Completely independent of the sidebar's visibility state, so results
 * never disappear when action cards refresh.
 */
export function ResultModalContainer() {
  const [panels, setPanels] = useState<ResultEntry[]>([]);

  const handleClose = useCallback((id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Listen for result events pushed from FollacOverlay
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, action, output } = (e as CustomEvent<ResultEntry>).detail;
      setPanels((prev) => {
        const without = prev.filter((p) => p.id !== id);
        return [...without, { id, action, output }];
      });
    };
    document.addEventListener("follac:show-result", handler);
    return () => document.removeEventListener("follac:show-result", handler);
  }, []);

  // Show the topmost panel only (stack model)
  const top = panels[panels.length - 1];
  if (!top) return null;

  return <ModalCard key={top.id} entry={top} onClose={() => handleClose(top.id)} />;
}
