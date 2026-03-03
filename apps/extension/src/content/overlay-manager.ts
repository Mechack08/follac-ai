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
  /**
   * Called by the React component on first mount to consume any update/show
   * calls that arrived before useEffect listeners were attached.
   */
  getInitialState?: () => { context: ContextObject | null; actions: ProposedAction[]; visible: boolean };
};

export class OverlayManager {
  private hostEl: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private isInjected = false;
  private callbacks: OverlayCallbacks;

  // ── Pending state ──────────────────────────────────────────────────────────
  // Stored so the React component can initialise from them on first mount,
  // bridging the race between createRoot().render() and the synchronous
  // document.dispatchEvent() calls that follow injectIfNeeded().
  private pendingContext: ContextObject | null = null;
  private pendingActions: ProposedAction[] = [];
  private pendingVisible = false;

  constructor(callbacks: OverlayCallbacks) {
    this.callbacks = {
      ...callbacks,
      getInitialState: () => ({
        context: this.pendingContext,
        actions: this.pendingActions,
        visible: this.pendingVisible,
      }),
    };
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

    // Inject Tailwind styles into shadow root (popup.css is the compiled Tailwind output)
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("popup.css");
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
    // Save so getInitialState() can supply them if React hasn't mounted yet.
    this.pendingContext = context;
    this.pendingActions = actions;
    if (!this.isInjected) return;
    // Dispatch on document so the React component inside Shadow DOM can receive it
    document.dispatchEvent(new CustomEvent("follac:update", { detail: { context, actions } }));
  }

  show(): void {
    this.pendingVisible = true;
    // Let React own visibility — dispatch an event instead of CSS manipulation.
    // The host element is always in the DOM (pointerEvents:none acts as pass-through).
    document.dispatchEvent(new CustomEvent("follac:sidebar-show"));
  }

  hide(): void {
    // Only hides the sidebar action panel. Result modals stay open independently.
    document.dispatchEvent(new CustomEvent("follac:sidebar-hide"));
  }

  destroy(): void {
    this.hostEl?.remove();
    this.hostEl = null;
    this.shadowRoot = null;
    this.isInjected = false;
  }
}
