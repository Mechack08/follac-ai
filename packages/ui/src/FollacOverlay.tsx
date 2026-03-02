import { useState, useEffect } from "react";
import type { ContextObject, ProposedAction } from "@follac/shared";
import type { OverlayCallbacks } from "./types.js";
import { ActionCard } from "./ActionCard.js";
import { ContextBadge } from "./ContextBadge.js";

interface FollacOverlayProps {
  callbacks: OverlayCallbacks;
}

/**
 * FollacOverlay — The primary in-page overlay component.
 *
 * Injected into the host page via Shadow DOM.
 * Receives context/action updates via CustomEvents on document.
 * Execution results are delivered via the `follac:result` event.
 */
export function FollacOverlay({ callbacks }: FollacOverlayProps) {
  const [context, setContext] = useState<ContextObject | null>(null);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [resultMap, setResultMap] = useState<Record<string, string>>({});

  // Listen for context + action updates from OverlayManager
  useEffect(() => {
    const handler = (e: Event) => {
      const { context: ctx, actions: acts } = (e as CustomEvent<{
        context: ContextObject;
        actions: ProposedAction[];
      }>).detail;
      setContext(ctx);
      setActions(acts);
      setResultMap({});
      setExecutingId(null);
      setIsVisible(acts.length > 0);
    };
    document.addEventListener("follac:update", handler);
    return () => document.removeEventListener("follac:update", handler);
  }, []);

  // Listen for execution results from content script
  useEffect(() => {
    const handler = (e: Event) => {
      const { actionId, output } = (e as CustomEvent<{
        actionId: string;
        output: string;
      }>).detail;
      setResultMap((prev) => ({ ...prev, [actionId]: output }));
      setExecutingId((prev) => (prev === actionId ? null : prev));
    };
    document.addEventListener("follac:result", handler);
    return () => document.removeEventListener("follac:result", handler);
  }, []);

  const handleApprove = (action: ProposedAction) => {
    setExecutingId(action.id);
    callbacks.onActionApproved(action);
  };

  const handleReject = (actionId: string) => {
    callbacks.onActionRejected(actionId);
    setActions((prev) => prev.filter((a) => a.id !== actionId));
  };

  const handleDismissResult = (actionId: string) => {
    setActions((prev) => prev.filter((a) => a.id !== actionId));
    setResultMap((prev) => {
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
  };

  if (!isVisible || !context) return null;

  return (
    <div
      className="animate-slide-in fixed top-4 right-4 w-[360px] rounded-follac bg-slate-900 border border-slate-700 shadow-follac overflow-hidden"
      style={{ pointerEvents: "all" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-follac-600 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">F</span>
          </div>
          <span className="text-xs font-semibold text-slate-200">Follac AI</span>
        </div>

        <ContextBadge platform={context.platform} />

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors text-xs"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? "▲" : "▼"}
          </button>
          <button
            onClick={() => {
              setIsVisible(false);
              callbacks.onDismiss();
            }}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors text-xs"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="p-3 space-y-2 max-h-[520px] overflow-y-auto">
          {/* Intent line */}
          <p className="text-xs text-slate-400 leading-relaxed">{context.inferredIntent}</p>

          {/* Action cards */}
          {actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              isExecuting={executingId === action.id}
              result={resultMap[action.id]}
              onApprove={() => handleApprove(action)}
              onReject={() => handleReject(action.id)}
              onDismissResult={() => handleDismissResult(action.id)}
            />
          ))}

          {actions.length === 0 && (
            <p className="text-center text-[11px] text-slate-500 py-2">All done!</p>
          )}

          <p className="text-center text-[10px] text-slate-600 pt-1">
            Actions require your approval
          </p>
        </div>
      )}
    </div>
  );
}
