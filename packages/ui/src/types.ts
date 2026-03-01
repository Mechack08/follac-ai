import type { ProposedAction } from "@follac/shared";

export type OverlayCallbacks = {
  onActionApproved: (action: ProposedAction) => void;
  onActionRejected: (actionId: string) => void;
  onDismiss: () => void;
};
