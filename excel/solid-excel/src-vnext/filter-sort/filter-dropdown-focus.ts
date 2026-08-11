import { createEffect, onCleanup, type Accessor } from 'solid-js'

interface FilterDropdownFocusOptions {
  readonly isOpen: Accessor<boolean>
  readonly sessionId: Accessor<number>
  readonly lifecycleStatus: Accessor<string>
  readonly canClose: Accessor<boolean>
  readonly close: () => void
  readonly focusSearch: () => void
  readonly focusRetry: () => void
}

/** Keeps DOM focus inside the interaction contract without creating UI state. */
export function useFilterDropdownFocus(options: FilterDropdownFocusOptions) {
  let opener: HTMLElement | undefined
  let openedSessionId: number | undefined

  createEffect(() => {
    const open = options.isOpen()
    const sessionId = options.sessionId()
    if (!open) {
      if (openedSessionId !== undefined) {
        openedSessionId = undefined
        const target = opener
        opener = undefined
        queueMicrotask(() => target?.isConnected && target.focus())
      }
      return
    }
    if (openedSessionId === sessionId) return

    openedSessionId = sessionId
    const activeElement = document.activeElement
    opener = activeElement instanceof HTMLElement ? activeElement : undefined
    queueMicrotask(() => {
      if (options.isOpen() && options.sessionId() === sessionId) options.focusSearch()
    })
  })

  createEffect(() => {
    if (!options.isOpen() || options.lifecycleStatus() !== 'refresh-failed') return
    const sessionId = options.sessionId()
    queueMicrotask(() => {
      if (
        options.isOpen() &&
        options.sessionId() === sessionId &&
        options.lifecycleStatus() === 'refresh-failed'
      ) {
        options.focusRetry()
      }
    })
  })

  createEffect(() => {
    if (!options.isOpen()) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (!options.canClose()) return
      event.preventDefault()
      options.close()
    }
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })
}
