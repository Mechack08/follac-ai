/**
 * Follac AI — OverlayManager
 *
 * Injects and controls the React overlay UI in the host page DOM.
 *
 * Strategy:
 * - Create a Shadow DOM root to isolate Follac styles from page styles
 * - Inject the React app inside the shadow root
 * - Use a fixed-position container appended to <body>
 * - Dynamically import the overlay component to avoid loading React on pages
 *   where no adapter is active
 *
 * The overlay communicates back via window.postMessage or direct callbacks,
 * never by modifying the host page's state.
 */

import type { ContextObject, ProposedAction } from "@follac/shared";
import { EXTENSION_CONFIG } from "@follac/shared";

export type OverlayCallbacks = {
  onActionApproved: (action: ProposedAction) => void;
  onActionRejected: (actionId: string) => void;
  onDismiss: () => void;
};

export class OverlayManager {
  private hostEl: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private isInjected = false;
  private callbacks: OverlayCallbacks;

  constructor(callbacks: OverlayCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Lazily inject the overlay container into the page.
   * Safe to call multiple times — checks isInjected first.
   */
  async injectIfNeeded(): Promise<void> {
    if (this.isInjected) return;

    this.hostEl = document.createElement("div");
    this.hostEl.id = "follac-ai-root";

    Object.assign(this.hostEl.style, {
      position: "fixed",
      top: "0",
      right: "0",
      width: `${EXTENSION_CONFIG.OVERLAY_WIDTH_PX}px`,
      height: "auto",
      zIndex: String(EXTENSION_CONFIG.OVERLAY_Z_INDEX),
      pointerEvents: "none",
    });

    this.shadowRoot = this.hostEl.attachShadow({ mode: "open" });

    // Inject Tailwind styles into shadow root
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("assets/content.css");
    this.shadowRoot.appendChild(styleLink);

    const mountPoint = document.createElement("div");
    mountPoint.id = "follac-mount";
    this.shadowRoot.appendChild(mountPoint);

    document.body.appendChild(this.hostEl);
    this.isInjected = true;

    // Dynamically import React overlay to avoid loading if unneeded
    const { mountOverlay } = await import("./overlay.tsx");
    mountOverlay(mountPoint, this.callbacks);
  }

  /**
   * Update the overlay with new context and proposed actions.
   */
  update(context: ContextObject, actions: ProposedAction[]): void {
    if (!this.isInjected) return;
    const event = new CustomEvent("follac:update", { detail: { context, actions } });
    this.hostEl?.dispatchEvent(event);
  }

  show(): void {
    if (this.hostEl) {
      this.hostEl.style.display = "block";
    }
  }

  hide(): void {
    if (this.hostEl) {
      this.hostEl.style.display = "none";
    }
  }

  destroy(): void {
    this.hostEl?.remove();
    this.hostEl = null;
    this.shadowRoot = null;
    this.isInjected = false;
  }
}
