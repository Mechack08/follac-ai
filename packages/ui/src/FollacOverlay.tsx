import { useState, useEffect } from "react";
import type { ContextObject, ProposedAction } from "@follac/shared";
import type { OverlayCallbacks } from "./types.js";
import { ActionCard } from "./ActionCard.js";
import { isDisplayAction, type ResultEntry } from "./ResultModal.js";
import { ContextBadge } from "./ContextBadge.js";

interface FollacOverlayProps {
  callbacks: OverlayCallbacks;
}

/**
 * FollacOverlay — Right-side action card sidebar.
 *
 * Injected into the host page via Shadow DOM.
 * Shows pending action cards. Execution results for display-type actions
 * (summarize, extract-tasks, research) are dispatched as `follac:show-result`
 * events and picked up by ResultModalContainer independently.
 *
 * Visibility is driven by `follac:sidebar-show` / `follac:sidebar-hide`
 * events (dispatched by OverlayManager) — never by CSS display manipulation,
 * so result modals are never accidentally hidden.
 */
export function FollacOverlay({ callbacks }: FollacOverlayProps) {
  const [context, setContext] = useState<ContextObject | null>(null);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [successMap, setSuccessMap] = useState<Record<string, string>>({});

  // ── Sidebar visibility ────────────────────────────────────────────────────
  useEffect(() => {
    const show = () => setIsSidebarVisible(true);
    const hide = () => setIsSidebarVisible(false);
    document.addEventListener("follac:sidebar-show", show);
    document.addEventListener("follac:sidebar-hide", hide);
    return () => {
      document.removeEventListener("follac:sidebar-show", show);
      document.removeEventListener("follac:sidebar-hide", hide);
    };
  }, []);

  // ── Context + action updates ──────────────────────────────────────────────
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
      setIsSidebarVisible(true);
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
          // ── Display action: open in the ResultModal popup ──────────────
          const entry: ResultEntry = { id: actionId, action, output };
          document.dispatchEvent(
            new CustomEvent("follac:show-result", { detail: entry }),
          );
          return currentActions.filter((a) => a.id !== actionId);
        }

        // ── DOM-write action (or error): show brief status, then auto-dismiss ──
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

  if (!isSidebarVisible || !context || actions.length === 0) return null;

  return (
    <div
      className="animate-slide-in fixed top-4 right-4 w-[360px] rounded-follac bg-slate-900 border border-slate-700 shadow-follac overflow-hidden"
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
              setIsSidebarVisible(false);
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
        <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-slate-400 leading-relaxed">{context.inferredIntent}</p>

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

          <p className="text-center text-[10px] text-slate-600 pt-1">
            Actions require your approval
          </p>
        </div>
      )}
    </div>
  );
}
