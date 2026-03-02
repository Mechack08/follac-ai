/**
 * Follac AI — Overlay Mount
 *
 * Dynamically rendered inside the Shadow DOM.
 * Mounts two independent React trees:
 *  1. FollacOverlay  — right-side action card sidebar
 *  2. ResultModalContainer — centered popup for display-type results
 */

import { createRoot } from "react-dom/client";
import type { OverlayCallbacks } from "./overlay-manager.js";
import { FollacOverlay, ResultModalContainer } from "@follac/ui";

export function mountOverlay(mountPoint: HTMLElement, callbacks: OverlayCallbacks): void {
  const root = createRoot(mountPoint);
  root.render(
    <>
      <FollacOverlay callbacks={callbacks} />
      <ResultModalContainer />
    </>,
  );
}
