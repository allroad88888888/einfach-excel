import {
  dispatchKeyboardInputAtom,
  lastKeyboardIntentAtom,
  type KeyboardMergeRangeResolver,
  type ScrollToCellIntent,
} from '@einfach/spreadsheet-ui-core'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'

/** Configuration for translating a Vue grid surface's key events into UI-core navigation. */
export interface UseSpreadsheetKeyboardNavigationOptions {
  /** Number of currently visible data rows used for PageUp and PageDown. */
  readonly pageRowDelta: number
  /** Number of currently visible data columns used for Alt+PageUp and Alt+PageDown. */
  readonly pageColDelta: number
  /** Receives the core-owned viewport intent after navigation moves the selection. */
  readonly onScrollToCell?: (intent: ScrollToCellIntent) => void
  /** Resolves merged ranges while a plain arrow key is interpreted. */
  readonly resolveMergeRange?: KeyboardMergeRangeResolver
}

/** Native keyboard event handlers for a focusable Vue spreadsheet surface. */
export interface SpreadsheetKeyboardNavigationHandlers {
  onKeydown: (event: KeyboardEvent) => void
}

/** Binds a grid surface's key events to the nearest UI-core navigation store. */
export function useSpreadsheetKeyboardNavigation(
  options: UseSpreadsheetKeyboardNavigationOptions,
): SpreadsheetKeyboardNavigationHandlers {
  const core = useSpreadsheetUiCore()

  const onKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return

    const store = core.value.store
    store.setter(dispatchKeyboardInputAtom, {
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      isComposing: event.isComposing,
      pageRowDelta: options.pageRowDelta,
      pageColDelta: options.pageColDelta,
      resolveMergeRange: options.resolveMergeRange,
    })
    const intent = store.getter(lastKeyboardIntentAtom)
    if (intent.type === 'selection.move') {
      event.preventDefault()
      options.onScrollToCell?.(intent.scroll)
      return
    }
    if (intent.type === 'selection.selectAll' || intent.type === 'selection.clearNonPrimary') {
      event.preventDefault()
    }
  }

  return { onKeydown }
}
