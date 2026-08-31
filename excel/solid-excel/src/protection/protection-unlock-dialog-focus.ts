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

/** Moves focus into the password field without creating dialog product state. */
export function focusProtectionUnlockDialog(root: HTMLElement | undefined): void {
  if (!root?.isConnected) return
  const password = root.querySelector<HTMLElement>(
    '[data-testid="protection-unlock-password"]:not([disabled])',
  )
  focus(password ?? focusableElements(root)[0] ?? root)
}

/** Restores a still-mounted element that was active before the modal opened. */
export function restoreProtectionUnlockFocus(target: HTMLElement | undefined): void {
  focus(target)
}

/** Keeps keyboard focus within the unlock modal while commands remain atom-owned. */
export function trapProtectionUnlockDialogTab(
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
