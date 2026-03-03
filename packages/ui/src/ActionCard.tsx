import type { ProposedAction } from "@follac/shared";

interface ActionCardProps {
  action: ProposedAction;
  isExecuting: boolean;
  /** For DOM-write actions: a brief success/error message shown before auto-dismiss. */
  successMessage?: string;
  /** Tailwind animation class for staggered entrance (e.g. animate-fade-up-1) */
  className?: string;
  onApprove: () => void;
  onReject: () => void;
}

const ACTION_ICONS: Record<string, string> = {
  "draft-email": "✍️",
  "generate-reply": "↩️",
  "summarize-thread": "📋",
  "summarize-document": "📄",
  "extract-tasks": "✅",
  "compose-linkedin-message": "💬",
  "rewrite-paragraph": "🔄",
  "write-section": "✏️",
  "research-person": "🔍",
  "custom": "⚡",
};

export function ActionCard({ action, isExecuting, successMessage, className = "", onApprove, onReject }: ActionCardProps) {
  const confidence = Math.round(action.confidence * 100);
  const icon = ACTION_ICONS[action.type] ?? "⚡";
  const isError = successMessage?.startsWith("⚠");

  return (
    <div className={`rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors p-2.5 space-y-2 ${className}`}>
      {/* ── Card info row ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-semibold text-slate-100 truncate">{action.title}</p>
            <span className="flex-shrink-0 text-[10px] text-slate-500">{confidence}%</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{action.description}</p>
        </div>
      </div>

      {/* ── State-based bottom row ────────────────────────────────────── */}
      {successMessage ? (
        // Brief success / error state — parent auto-removes this card after ~2s
        <div className={`flex items-center gap-2 py-0.5 ${isError ? "text-amber-400" : "text-emerald-400"}`}>
          <span className="text-sm">{isError ? "⚠" : "✓"}</span>
          <span className="text-[11px] font-medium">
            {isError ? successMessage.replace(/^⚠\s*/, "") : "Applied to editor"}
          </span>
        </div>
      ) : isExecuting ? (
        <div className="flex items-center gap-2 py-0.5">
          <div className="h-3 w-3 rounded-full border border-follac-400 border-t-transparent animate-spin flex-shrink-0" />
          <span className="text-[11px] text-follac-400">Running…</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={onApprove}
            className="flex-1 py-1 text-[11px] font-semibold rounded-md bg-follac-600 hover:bg-follac-500 text-white transition-colors"
          >
            Run →
          </button>
          <button
            onClick={onReject}
            className="px-2.5 py-1 text-[11px] rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

