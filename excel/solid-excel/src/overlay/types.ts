import type { Accessor } from 'solid-js'

/** The interaction-only reasons an overlay asks its owning feature to close. */
export type OverlayCloseReason = 'escape'

/**
 * DOM-only inputs for an overlay. Product state such as open, draft, pending,
 * and error remains in the feature's domain atoms and is exposed here only as
 * read accessors or close callbacks.
 */
export interface OverlayInteractionOptions {
  /** The feature-owned atom-derived visibility state. */
  readonly active: Accessor<boolean>
  /** Delegates a close request to the feature-owned command atom. */
  readonly onRequestClose: (reason: OverlayCloseReason) => void
  /** The trigger whose geometry and focus ownership belong to this overlay. */
  readonly anchor?: Accessor<HTMLElement | null | undefined>
  /** An optional element inside the overlay to receive initial focus. */
  readonly initialFocus?: Accessor<HTMLElement | null | undefined>
  /** Defaults to true; lets a surface reserve Escape for its own keyboard mode. */
  readonly closeOnEscape?: boolean
  /** Defaults to true for dialogs; popovers can opt out. */
  readonly trapFocus?: boolean
  /** Defaults to true; set false for non-modal overlays that retain grid focus. */
  readonly restoreFocus?: boolean
  /** Allows a future overlay stack to suppress background overlays. */
  readonly isTopmost?: Accessor<boolean>
}

/** Imperative DOM helpers returned to the overlay renderer. */
export interface OverlayInteraction {
  /** Attach this to the dialog or popover root. */
  readonly overlayRef: (element: HTMLElement) => void
  /** Returns the current connected anchor geometry, or null after unmount. */
  readonly anchorRect: () => DOMRect | null
  /** Lets click-outside handlers exclude both the overlay and its live anchor. */
  readonly containsTarget: (target: EventTarget | null) => boolean
  /** Use this only when a renderer needs to forward an Escape close request. */
  readonly requestClose: (reason: OverlayCloseReason) => void
}
