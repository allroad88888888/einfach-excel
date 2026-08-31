const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const FORM_CONTROL_SELECTOR = [
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
].join(',')

function isUsable(element: HTMLElement): boolean {
  if (!element.isConnected) return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function focus(element: HTMLElement | undefined): void {
  if (!element?.isConnected) return
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isUsable)
}

/** Moves focus into the active wizard without introducing product-local state. */
export function focusTextToColumnsDialog(root: HTMLElement | undefined): void {
  if (!root?.isConnected) return
  const initial = Array.from(root.querySelectorAll<HTMLElement>(FORM_CONTROL_SELECTOR)).find(
    isUsable,
  )
  focus(initial ?? getFocusableElements(root)[0] ?? root)
}

/** Restores a still-mounted element that was active before the modal opened. */
export function restoreTextToColumnsFocus(target: HTMLElement | undefined): void {
  focus(target)
}

/** Keeps keyboard focus within the modal while leaving keyboard commands to its controller. */
export function trapTextToColumnsDialogTab(
  event: KeyboardEvent,
  root: HTMLElement | undefined,
): void {
  if (event.key !== 'Tab' || !root?.isConnected) return
  const focusable = getFocusableElements(root)
  if (focusable.length === 0) {
    event.preventDefault()
    focus(root)
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const activeElement = document.activeElement
  const isOutside = !(activeElement instanceof Node) || !root.contains(activeElement)
  const wrapsForward = !event.shiftKey && (isOutside || activeElement === last)
  const wrapsBackward = event.shiftKey && (isOutside || activeElement === first)
  if (!wrapsForward && !wrapsBackward) return

  event.preventDefault()
  focus(event.shiftKey ? last : first)
}
