import type { Store } from '@einfach/core'
import {
  clearClipboardAtom,
  clipboardStateAtom,
  copyClipboardAtom,
  cutClipboardAtom,
  markClipboardReadyAtom,
  pasteClipboardAtom,
  setClipboardErrorAtom,
  type ClipboardIntent,
  type ClipboardState,
  type ClipboardTransferInput,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useMemo } from 'react'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

/** UI-core-owned clipboard state and commands for the nearest provider. */
export interface SpreadsheetClipboard {
  readonly state: ClipboardState
  copy(input: ClipboardTransferInput): ClipboardIntent | null
  cut(input: ClipboardTransferInput): ClipboardIntent | null
  paste(input: ClipboardTransferInput): ClipboardIntent | null
  clear(): void
  ready(): void
  setError(error: ClipboardState['error']): ClipboardState
}

function createClipboardStateSource(store: Store): SpreadsheetValueSource<ClipboardState> {
  return {
    getSnapshot: () => store.getter(clipboardStateAtom),
    subscribe: (onStoreChange) => store.sub(clipboardStateAtom, onStoreChange),
  }
}

/** Reads and dispatches clipboard state through the nearest SpreadsheetUiProvider. */
export function useSpreadsheetClipboard(): SpreadsheetClipboard {
  const { store } = useSpreadsheetUiCore()
  const source = useMemo(() => createClipboardStateSource(store), [store])
  const state = useSpreadsheetValue(source)
  const copy = useCallback(
    (input: ClipboardTransferInput) => store.setter(copyClipboardAtom, input),
    [store],
  )
  const cut = useCallback(
    (input: ClipboardTransferInput) => store.setter(cutClipboardAtom, input),
    [store],
  )
  const paste = useCallback(
    (input: ClipboardTransferInput) => store.setter(pasteClipboardAtom, input),
    [store],
  )
  const clear = useCallback(() => store.setter(clearClipboardAtom), [store])
  const ready = useCallback(() => store.setter(markClipboardReadyAtom), [store])
  const setError = useCallback(
    (error: ClipboardState['error']) => store.setter(setClipboardErrorAtom, error),
    [store],
  )

  return useMemo(
    () => ({ state, copy, cut, paste, clear, ready, setError }),
    [clear, copy, cut, paste, ready, setError, state],
  )
}
