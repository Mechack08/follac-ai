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
 * Rendered inside the extension's isolated style context.
 *
 * Receives context/action updates via a CustomEvent fired from OverlayManager.
 * All approval/rejection events are passed back through callbacks.
 */
export function FollacOverlay({ callbacks }: FollacOverlayProps) {
  const [context, setContext] = useState<ContextObject | null>(null);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);

  // Listen for updates from OverlayManager via CustomEvent
  useEffect(() => {
    const handler = (e: Event) => {
      const { context: ctx, actions: acts } = (e as CustomEvent<{
        context: ContextObject;
        actions: ProposedAction[];
      }>).detail;

      setContext(ctx);
      setActions(acts);
      setIsVisible(acts.length > 0);
    };

    // The custom event is dispatched on the host element (outside shadow root)
    // We listen on the document and bubble it through
    document.addEventListener("follac:update", handler);
    return () => document.removeEventListener("follac:update", handler);
  }, []);

  const handleApprove = async (action: ProposedAction) => {
    setExecutingId(action.id);
    callbacks.onActionApproved(action);
    // Optimistically remove action from list after short delay
    setTimeout(() => {
      setActions((prev) => prev.filter((a) => a.id !== action.id));
      setExecutingId(null);
    }, 1500);
  };

  const handleReject = (actionId: string) => {
    callbacks.onActionRejected(actionId);
    setActions((prev) => prev.filter((a) => a.id !== actionId));
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
        <div className="p-3 space-y-2 max-h-[480px] overflow-y-auto">
          {/* Intent line */}
          <p className="text-xs text-slate-400 leading-relaxed">{context.inferredIntent}</p>

          {/* Action cards */}
          {actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              isExecuting={executingId === action.id}
              onApprove={() => void handleApprove(action)}
              onReject={() => handleReject(action.id)}
            />
          ))}

          <p className="text-center text-[10px] text-slate-600 pt-1">
            Actions require your approval
          </p>
        </div>
      )}
    </div>
  );
}
