const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focus(element: HTMLElement | undefined): void {
  if (!element?.isConnected) return
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.isConnected && !element.hidden,
  )
}

/** Moves focus to the first editable control without creating dialog product state. */
export function focusDataValidationDialog(root: HTMLElement | undefined): void {
  if (!root?.isConnected) return
  const initial = root.querySelector<HTMLElement>(
    '[data-testid="validation-kind-select"]:not([disabled])',
  )
  focus(initial ?? focusableElements(root)[0] ?? root)
}

/** Restores the pre-dialog focus target when it is still mounted. */
export function restoreDataValidationFocus(target: HTMLElement | undefined): void {
  focus(target)
}

/** Keeps DOM focus inside the dialog while leaving product commands in the controller. */
export function trapDataValidationDialogTab(
  event: KeyboardEvent,
  root: HTMLElement | undefined,
): void {
  if (event.key !== 'Tab' || !root?.isConnected) return
  const focusable = focusableElements(root)
  if (focusable.length === 0) {
    event.preventDefault()
    focus(root)
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const outside = !(active instanceof Node) || !root.contains(active)
  const wrapsForward = !event.shiftKey && (outside || active === last)
  const wrapsBackward = event.shiftKey && (outside || active === first)
  if (!wrapsForward && !wrapsBackward) return
  event.preventDefault()
  focus(event.shiftKey ? last : first)
}
