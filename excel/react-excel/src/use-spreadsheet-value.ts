import { useCallback, useSyncExternalStore } from 'react'

/** A framework-neutral value source that React can observe. */
export interface SpreadsheetValueSource<T> {
  getSnapshot: () => T
  subscribe: (onStoreChange: () => void) => () => void
}

/**
 * Reads a spreadsheet value source through React's external-store contract.
 *
 * `useSyncExternalStore` keeps React's concurrent renders consistent while
 * the spreadsheet source remains the sole owner of its value.
 */
export function useSpreadsheetValue<T>(source: SpreadsheetValueSource<T>): T {
  const subscribe = useCallback(
    (onStoreChange: () => void) => source.subscribe(onStoreChange),
    [source],
  )
  const getSnapshot = useCallback(() => source.getSnapshot(), [source])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
