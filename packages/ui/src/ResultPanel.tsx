import { useState } from "react";
import type { ProposedAction } from "@follac/shared";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Task {
  task: string;
  owner?: string;
  dueDate?: string | null;
  priority?: "high" | "medium" | "low";
}

interface ResultPanelProps {
  action: ProposedAction;
  output: string;
  onClose: () => void;
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

const PRIORITY_STYLES: Record<string, string> = {
  high: "text-red-400 bg-red-400/10 border border-red-500/30",
  medium: "text-yellow-400 bg-yellow-400/10 border border-yellow-500/30",
  low: "text-slate-400 bg-slate-400/10 border border-slate-500/30",
};

/**
 * Action types whose results should be shown in a persistent panel
 * rather than injected into the DOM.
 */
export const DISPLAY_ACTION_TYPES = new Set([
  "summarize-thread",
  "summarize-document",
  "extract-tasks",
  "research-person",
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
        <strong key={i} className="font-semibold text-slate-100">
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
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Empty line → small spacer
        if (!line.trim()) return <div key={i} className="h-1" />;

        // Indent continuation lines under a section header
        const clean = line.trim();

        // Bullet point • or - or *
        const bulletMatch = clean.match(/^[•\-\*]\s+(.*)/);
        if (bulletMatch) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="text-follac-400 text-[10px] mt-[3px] flex-shrink-0 select-none">
                ›
              </span>
              <span className="text-[11px] text-slate-300 leading-relaxed">
                {renderInline(bulletMatch[1] ?? "")}
              </span>
            </div>
          );
        }

        // Section header: **Heading:** or **Heading**
        if (clean.match(/^\*\*[^*]+\*\*:?\s*$/)) {
          const label = clean.replace(/\*\*/g, "").replace(/:$/, "");
          return (
            <p
              key={i}
              className="text-[11px] font-semibold text-slate-200 mt-2.5 first:mt-0 pb-0.5 border-b border-slate-700"
            >
              {label}
            </p>
          );
        }

        // Normal paragraph
        return (
          <p key={i} className="text-[11px] text-slate-300 leading-relaxed">
            {renderInline(clean)}
          </p>
        );
      })}
    </div>
  );
}

// ─── Task List Renderer ───────────────────────────────────────────────────

function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <div className="space-y-1.5">
      {tasks.map((task, i) => (
        <div
          key={i}
          className="rounded-md bg-slate-800/80 border border-slate-700 p-2 space-y-1.5"
        >
          <p className="text-[11px] text-slate-200 leading-snug">{task.task}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {task.owner && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-700/80 rounded px-1.5 py-0.5">
                <span>👤</span>
                <span>{task.owner}</span>
              </span>
            )}
            {task.dueDate && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-700/80 rounded px-1.5 py-0.5">
                <span>📅</span>
                <span>{task.dueDate}</span>
              </span>
            )}
            {task.priority && (
              <span
                className={`text-[10px] rounded px-1.5 py-0.5 font-medium ${PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES["low"]}`}
              >
                {task.priority}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ResultPanel ──────────────────────────────────────────────────────────

/**
 * ResultPanel — persistent, formatted display of AI-generated content.
 *
 * Shown for display-type actions (summarize, extract-tasks, research).
 * Lives independently of the action card list and survives context updates.
 * The user can read, copy, and close it at their own pace.
 */
export function ResultPanel({ action, output, onClose }: ResultPanelProps) {
  const [copied, setCopied] = useState(false);
  const icon = ACTION_ICONS[action.type] ?? "⚡";
  const isError = output.startsWith("⚠");
  const tasks = action.type === "extract-tasks" ? tryParseTasks(output) : null;

  const handleCopy = () => {
    void navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="rounded-lg bg-slate-900 border border-follac-500/40 overflow-hidden">
      {/* ── Panel header ─────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-follac-600/10 border-b border-follac-500/30">
        <span className="text-sm leading-none">{icon}</span>
        <p className="text-[11px] font-semibold text-follac-300 flex-1 truncate">
          {action.title}
        </p>
        <span className="text-[10px] text-slate-500 mr-1">Result</span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-700 text-slate-500 hover:text-slate-200 transition-colors text-[10px] flex-shrink-0"
          title="Close result"
        >
          ✕
        </button>
      </div>

      {/* ── Content ──────────────────────── */}
      <div className="p-2.5 space-y-2.5">
        {isError ? (
          <p className="text-[11px] text-amber-400 leading-relaxed">{output}</p>
        ) : tasks ? (
          /* Extract-tasks: structured task list */
          <div className="max-h-64 overflow-y-auto pr-0.5">
            <TaskList tasks={tasks} />
          </div>
        ) : (
          /* Default: markdown-rendered text */
          <div className="max-h-64 overflow-y-auto pr-0.5 scrollbar-thin">
            <MarkdownContent text={output} />
          </div>
        )}

        {/* ── Actions ──────────────────────── */}
        {!isError && (
          <button
            onClick={handleCopy}
            className="w-full py-1.5 text-[11px] font-medium rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-follac-500/50 text-slate-400 hover:text-slate-200 transition-all"
          >
            {copied ? "✓ Copied to clipboard" : "📋 Copy"}
          </button>
        )}
      </div>
    </div>
  );
}
