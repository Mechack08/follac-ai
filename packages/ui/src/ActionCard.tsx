import { useState } from "react";
import type { ProposedAction } from "@follac/shared";

interface ActionCardProps {
  action: ProposedAction;
  isExecuting: boolean;
  result?: string;
  onApprove: () => void;
  onReject: () => void;
  onDismissResult?: () => void;
}

const ACTION_ICONS: Record<string, string> = {
  "draft-email": "✍️",
  "generate-reply": "↩️",
  "summarize-thread": "📋",
  "summarize-document": "📄",
  "extract-tasks": "✅",
  "compose-linkedin-message": "💬",
  "rewrite-paragraph": "🔄",
  "research-person": "🔍",
  "custom": "⚡",
};

export function ActionCard({ action, isExecuting, result, onApprove, onReject, onDismissResult }: ActionCardProps) {
  const [copied, setCopied] = useState(false);
  const confidence = Math.round(action.confidence * 100);
  const icon = ACTION_ICONS[action.type] ?? "⚡";

  const handleCopy = () => {
    if (result) {
      void navigator.clipboard.writeText(result).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  return (
    <div className="rounded-lg bg-slate-800 border border-slate-700 hover:border-follac-600 transition-colors p-2.5 space-y-2">
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

      {result ? (
        <div className="space-y-1.5">
          <div className="rounded-md bg-slate-900 border border-slate-600 p-2 max-h-40 overflow-y-auto">
            <pre className="text-[10px] text-slate-300 whitespace-pre-wrap break-words leading-relaxed font-mono">{result}</pre>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="flex-1 py-1 text-[11px] font-semibold rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={onDismissResult}
              className="px-2.5 py-1 text-[11px] rounded-md bg-slate-700 hover:bg-slate-600 text-slate-400 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : isExecuting ? (
        <div className="flex items-center gap-2 py-1">
          <div className="h-3 w-3 rounded-full border border-follac-400 border-t-transparent animate-spin" />
          <span className="text-[11px] text-follac-400">Running...</span>
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
