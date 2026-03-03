import { useState, useEffect, useRef } from "react";
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
  /** Ref mirror of executingId — always current inside async event handlers. */
  const executingIdRef = useRef<string | null>(null);
  const [successMap, setSuccessMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  /** Incremented only when action types change — prevents blinking on poll-only updates */
  const generationRef = useRef(0);
  const [generation, setGeneration] = useState(0);
  const actionFingerprintRef = useRef("");

  // ── Loading state (navigation started, waiting for new actions) ─────────
  useEffect(() => {
    const handler = () => {
      setIsLoading(true);
      setActions([]);
      setSuccessMap({});
      setExecutingId(null);
    };
    document.addEventListener("follac:loading", handler);
    return () => document.removeEventListener("follac:loading", handler);
  }, []);

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
      setIsLoading(false);
      setIsSidebarVisible(true);
      // Never replace action cards while an execution is in flight —
      // the poll fires every 2s and would either clobber the spinner state
      // or reassign cards while waiting for the LLM result.
      if (!executingIdRef.current) {
        setActions(acts);
      }
      // Only re-animate cards and reset execution state when the set of action
      // *types* meaningfully changes (e.g. a new email opened), not on every
      // poll-driven re-detect where the same doc produces the same actions.
      const fingerprint = acts.map((a) => a.type).join(",");
      if (fingerprint !== actionFingerprintRef.current) {
        actionFingerprintRef.current = fingerprint;
        if (!executingIdRef.current) {
          setSuccessMap({});
          setExecutingId(null);
          generationRef.current += 1;
          setGeneration(generationRef.current);
        }
      }
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

      // Clear both state and ref synchronously so the very next
      // follac:update (2s poll) is not blocked unnecessarily.
      setExecutingId((prev) => {
        if (prev === actionId) {
          executingIdRef.current = null;
          return null;
        }
        return prev;
      });

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
    executingIdRef.current = action.id; // set ref before state so event handlers see it immediately
    setExecutingId(action.id);
    callbacks.onActionApproved(action);
  };

  const handleReject = (actionId: string) => {
    callbacks.onActionRejected(actionId);
    setActions((prev) => prev.filter((a) => a.id !== actionId));
  };

  if (!isSidebarVisible || !context) return null;

  const STAGGER = ["animate-fade-up-1", "animate-fade-up-2", "animate-fade-up-3"] as const;

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
          <p className="text-xs text-slate-400 leading-relaxed animate-fade-in">{context.inferredIntent}</p>

          {/* Loading skeleton while waiting for actions */}
          {isLoading && (
            <div className="space-y-2 animate-fade-in">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg bg-slate-800 border border-slate-700 p-2.5 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded bg-slate-700 animate-pulse-soft flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-slate-700 rounded animate-pulse-soft w-3/4" />
                      <div className="h-2.5 bg-slate-700/60 rounded animate-pulse-soft w-full" />
                    </div>
                  </div>
                  <div className="h-6 bg-slate-700/50 rounded-md animate-pulse-soft" />
                </div>
              ))}
            </div>
          )}

          {/* Action cards with staggered entrance */}
          {!isLoading && actions.map((action, i) => (
            <ActionCard
              key={`${generation}-${action.id}`}
              className={STAGGER[Math.min(i, 2)]}
              action={action}
              isExecuting={executingId === action.id}
              successMessage={successMap[action.id]}
              onApprove={() => handleApprove(action)}
              onReject={() => handleReject(action.id)}
            />
          ))}

          {!isLoading && actions.length === 0 && (
            <p className="text-center text-[11px] text-slate-500 py-2 animate-fade-in">All done!</p>
          )}

          <p className="text-center text-[10px] text-slate-600 pt-1">
            Actions require your approval
          </p>
        </div>
      )}
    </div>
  );
}
