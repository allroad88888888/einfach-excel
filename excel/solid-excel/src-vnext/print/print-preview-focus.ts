import { createEffect, on, onCleanup, type Accessor } from 'solid-js'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface PrintPreviewFocusOptions {
  readonly close: () => void
  readonly initialFocus: () => HTMLElement | undefined
  readonly isOpen: Accessor<boolean>
  readonly root: Accessor<HTMLElement | undefined>
}

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

/** Owns the temporary DOM focus session while atoms own preview visibility. */
export function usePrintPreviewFocus(options: PrintPreviewFocusOptions): void {
  createEffect(
    on(options.isOpen, (isOpen) => {
      if (!isOpen) return
      const opener =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      queueMicrotask(() => focus(options.initialFocus()))

      const onKeyDown = (event: KeyboardEvent) => {
        const root = options.root()
        if (!root?.isConnected) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          options.close()
          return
        }
        if (event.key !== 'Tab') return
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

      document.addEventListener('keydown', onKeyDown)
      onCleanup(() => {
        document.removeEventListener('keydown', onKeyDown)
        queueMicrotask(() => focus(opener))
      })
    }),
  )
}
