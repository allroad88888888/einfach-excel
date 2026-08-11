const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isConnected(element: HTMLElement | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => isConnected(element) && isVisible(element),
  )
}

export function focusElement(element: HTMLElement | null | undefined): boolean {
  if (!isConnected(element)) return false
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
  return document.activeElement === element
}

export function connectedElement(value: HTMLElement | null | undefined): HTMLElement | null {
  return isConnected(value) ? value : null
}
