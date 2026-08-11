import { createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

interface DialogInteractionsOptions {
  readonly isOpen: Accessor<boolean>
  readonly close: () => void
  readonly getInitialFocus: () => HTMLElement | undefined
}

/**
 * Owns the browser-only parts of a modal dialog: initial focus, Escape, and
 * returning focus to the element that opened it. Product state remains in
 * the caller's atoms.
 */
export function useDialogInteractions(options: DialogInteractionsOptions): void {
  let returnFocusTarget: HTMLElement | undefined

  createEffect<boolean>((wasOpen) => {
    const open = options.isOpen()
    if (open && !wasOpen) {
      const activeElement = document.activeElement
      returnFocusTarget = activeElement instanceof HTMLElement ? activeElement : undefined
      queueMicrotask(() => {
        if (options.isOpen()) options.getInitialFocus()?.focus()
      })
    }
    if (!open && wasOpen) {
      const focusTarget = returnFocusTarget
      returnFocusTarget = undefined
      queueMicrotask(() => {
        if (focusTarget?.isConnected) focusTarget.focus()
      })
    }
    return open
  }, false)

  createEffect(() => {
    if (!options.isOpen()) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      options.close()
    }
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })
}
