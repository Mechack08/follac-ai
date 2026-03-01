/**
 * Follac AI — Overlay Mount
 *
 * Dynamically rendered inside the Shadow DOM.
 * Receives callbacks from OverlayManager and renders the React UI.
 */

import { createRoot } from "react-dom/client";
import type { OverlayCallbacks } from "./overlay-manager.js";
import { FollacOverlay } from "@follac/ui";

export function mountOverlay(mountPoint: HTMLElement, callbacks: OverlayCallbacks): void {
  const root = createRoot(mountPoint);
  root.render(<FollacOverlay callbacks={callbacks} />);
}
