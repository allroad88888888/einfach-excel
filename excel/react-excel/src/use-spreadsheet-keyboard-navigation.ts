import {
  dispatchKeyboardInputAtom,
  lastKeyboardIntentAtom,
  type KeyboardMergeRangeResolver,
  type ScrollToCellIntent,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'

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

export interface SpreadsheetKeyboardNavigationHandlers {
  onKeyDown(event: ReactKeyboardEvent<HTMLElement>): void
}

/** Binds a grid surface's key events to the nearest UI-core navigation store. */
export function useSpreadsheetKeyboardNavigation(
  options: UseSpreadsheetKeyboardNavigationOptions,
): SpreadsheetKeyboardNavigationHandlers {
  const { store } = useSpreadsheetUiCore()
  const { onScrollToCell, pageColDelta, pageRowDelta, resolveMergeRange } = options

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented) return

      store.setter(dispatchKeyboardInputAtom, {
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
        pageRowDelta,
        pageColDelta,
        resolveMergeRange,
      })
      const intent = store.getter(lastKeyboardIntentAtom)
      if (intent.type === 'selection.move') {
        event.preventDefault()
        onScrollToCell?.(intent.scroll)
        return
      }
      if (intent.type === 'selection.selectAll' || intent.type === 'selection.clearNonPrimary') {
        event.preventDefault()
      }
    },
    [onScrollToCell, pageColDelta, pageRowDelta, resolveMergeRange, store],
  )

  return { onKeyDown }
}
