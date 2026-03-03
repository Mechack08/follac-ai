import type { ContextObject, ProposedAction } from "@follac/shared";

/** Snapshot of pending overlay state used to initialise the React component on first mount. */
export type OverlayInitialState = {
  context: ContextObject | null;
  actions: ProposedAction[];
  visible: boolean;
};

export type OverlayCallbacks = {
  onActionApproved: (action: ProposedAction) => void;
  onActionRejected: (actionId: string) => void;
  onDismiss: () => void;
  /**
   * Called by the React component immediately on mount so it can read any
   * update/show calls that arrived before React's useEffect listeners were
   * attached (the first-render race between createRoot().render() and the
   * synchronous DOM-event dispatch in OverlayManager).
   */
  getInitialState?: () => OverlayInitialState;
};
