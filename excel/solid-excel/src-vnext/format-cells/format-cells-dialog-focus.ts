import { createEffect, on, onCleanup, type Accessor } from 'solid-js'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  )
}

interface DialogFocusOptions {
  readonly isOpen: Accessor<boolean>
  readonly root: Accessor<HTMLElement | undefined>
  readonly close: () => void
  readonly initialFocus: () => HTMLElement | null | undefined
}

/** Own the transient DOM focus session while Atom state owns dialog visibility. */
export function useFormatCellsDialogFocus(options: DialogFocusOptions): void {
  createEffect(
    on(options.isOpen, (isOpen) => {
      if (!isOpen) return
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      queueMicrotask(() => options.initialFocus()?.focus())

      const onKeyDown = (event: KeyboardEvent) => {
        const root = options.root()
        if (!root) return
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
          root.focus()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || !root.contains(active))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (active === last || !root.contains(active))) {
          event.preventDefault()
          first.focus()
        }
      }

      document.addEventListener('keydown', onKeyDown)
      onCleanup(() => {
        document.removeEventListener('keydown', onKeyDown)
        queueMicrotask(() => opener?.focus())
      })
    }),
  )
}
