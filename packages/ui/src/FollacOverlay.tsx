import { useState, useEffect, useCallback } from "react";
import type { ContextObject, ProposedAction } from "@follac/shared";
import type { OverlayCallbacks } from "./types.js";
import { ActionCard } from "./ActionCard.js";
import { ResultPanel, isDisplayAction } from "./ResultPanel.js";
import { ContextBadge } from "./ContextBadge.js";

interface FollacOverlayProps {
  callbacks: OverlayCallbacks;
}

interface ResultPanelEntry {
  id: string;
  action: ProposedAction;
  output: string;
}

/**
 * FollacOverlay — The primary in-page overlay component.
 *
 * Injected into the host page via Shadow DOM.
 * Receives context/action updates via CustomEvents on document.
 * Execution results are delivered via the `follac:result` event.
 *
 * Two-section layout:
 *  1. Result panels  — persistent, formatted display results (survive context updates)
 *  2. Action cards   — pending actions waiting for user approval
 */
export function FollacOverlay({ callbacks }: FollacOverlayProps) {
  const [context, setContext] = useState<ContextObject | null>(null);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);
  // DOM-write actions: brief "✓ Applied" success then card auto-dismisses
  const [successMap, setSuccessMap] = useState<Record<string, string>>({});
  // Display actions: persistent result panels that survive context updates
  const [resultPanels, setResultPanels] = useState<ResultPanelEntry[]>([]);

  // ── Context + action updates ──────────────────────────────────────────────
  // Note: resultPanels are intentionally NOT cleared here — the user may still
  // be reading a summary when the context refreshes (e.g. SPA navigation).
  useEffect(() => {
    const handler = (e: Event) => {
      const { context: ctx, actions: acts } = (e as CustomEvent<{
        context: ContextObject;
        actions: ProposedAction[];
      }>).detail;
      setContext(ctx);
      setActions(acts);
      setSuccessMap({});
      setExecutingId(null);
      setIsVisible(true);
    };
    document.addEventListener("follac:update", handler);
    return () => document.removeEventListener("follac:update", handler);
  }, []);

  // ── Execution results ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { actionId, output } = (e as CustomEvent<{
        actionId: string;
        output: string;
      }>).detail;

      setExecutingId((prev) => (prev === actionId ? null : prev));

      setActions((currentActions) => {
        const action = currentActions.find((a) => a.id === actionId);
        if (!action) return currentActions;

        if (isDisplayAction(action.type) && !output.startsWith("⚠")) {
          // ── Display action: open persistent result panel, remove card ──
          setResultPanels((prev) => {
            // De-duplicate: replace if the same action ran again
            const without = prev.filter((p) => p.id !== actionId);
            return [...without, { id: actionId, action, output }];
          });
          return currentActions.filter((a) => a.id !== actionId);
        } else {
          // ── DOM-write action (or error): brief success/error then auto-dismiss ──
          const msg = output.startsWith("⚠") ? output : "✓ Applied to editor";
          setSuccessMap((prev) => ({ ...prev, [actionId]: msg }));
          setTimeout(() => {
            setActions((prev) => prev.filter((a) => a.id !== actionId));
            setSuccessMap((prev) => {
              const next = { ...prev };
              delete next[actionId];
              return next;
            });
          }, 2200);
          return currentActions;
        }
      });
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

  const handleClosePanel = useCallback((id: string) => {
    setResultPanels((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const hasContent = resultPanels.length > 0 || actions.length > 0;

  if (!isVisible || !context) return null;

  return (
    <div
      className="animate-slide-in fixed top-4 right-4 w-[380px] rounded-follac bg-slate-900 border border-slate-700 shadow-follac overflow-hidden"
      style={{ pointerEvents: "all" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
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

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="p-3 space-y-2 max-h-[80vh] overflow-y-auto">
          {/* Intent line */}
          <p className="text-xs text-slate-400 leading-relaxed">{context.inferredIntent}</p>

          {/* ── Persistent result panels (display actions) ─────────────── */}
          {resultPanels.map((panel) => (
            <ResultPanel
              key={panel.id}
              action={panel.action}
              output={panel.output}
              onClose={() => handleClosePanel(panel.id)}
            />
          ))}

          {/* Divider between panels and pending actions */}
          {resultPanels.length > 0 && actions.length > 0 && (
            <div className="border-t border-slate-700/60 pt-1">
              <p className="text-[10px] text-slate-600 uppercase tracking-wide">
                More suggestions
              </p>
            </div>
          )}

          {/* ── Pending action cards ───────────────────────────────────── */}
          {actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              isExecuting={executingId === action.id}
              successMessage={successMap[action.id]}
              onApprove={() => handleApprove(action)}
              onReject={() => handleReject(action.id)}
            />
          ))}

          {!hasContent && (
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
