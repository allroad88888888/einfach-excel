import type { Store } from '@einfach/core'
import {
  canRedoAtom,
  canUndoAtom,
  clearHistoryAtom,
  historyCanRetryRefreshAtom,
  historyLifecycleAtom,
  historyStackAtom,
  retryHistoryRefreshAtom,
  runRedoHistoryAtom,
  runUndoHistoryAtom,
  type HistoryCommandOutcome,
  type HistoryLifecycleState,
  type HistoryStackState,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useMemo } from 'react'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

/** Caller-provided projection refresh work for one history command. */
export interface SpreadsheetHistoryCommandInput {
  readonly refreshProjection: () => Promise<void>
  readonly timeoutMs?: number
}

/** UI-core-owned history state and commands for the nearest provider. */
export interface SpreadsheetHistory {
  readonly stack: HistoryStackState
  readonly lifecycle: HistoryLifecycleState
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly canRetryRefresh: boolean
  undo(input: SpreadsheetHistoryCommandInput): Promise<HistoryCommandOutcome>
  redo(input: SpreadsheetHistoryCommandInput): Promise<HistoryCommandOutcome>
  retryRefresh(input: SpreadsheetHistoryCommandInput): Promise<HistoryCommandOutcome>
  clear(): boolean
}

function createHistoryValueSource<T>(store: Store, atom: Parameters<Store['getter']>[0]) {
  return {
    getSnapshot: () => store.getter(atom) as T,
    subscribe: (onStoreChange: () => void) => store.sub(atom, onStoreChange),
  } satisfies SpreadsheetValueSource<T>
}

/** Reads and dispatches history through the nearest SpreadsheetUiProvider. */
export function useSpreadsheetHistory(): SpreadsheetHistory {
  const { backend, store } = useSpreadsheetUiCore()
  const stackSource = useMemo(
    () => createHistoryValueSource<HistoryStackState>(store, historyStackAtom),
    [store],
  )
  const lifecycleSource = useMemo(
    () => createHistoryValueSource<HistoryLifecycleState>(store, historyLifecycleAtom),
    [store],
  )
  const canUndoSource = useMemo(
    () => createHistoryValueSource<boolean>(store, canUndoAtom),
    [store],
  )
  const canRedoSource = useMemo(
    () => createHistoryValueSource<boolean>(store, canRedoAtom),
    [store],
  )
  const canRetryRefreshSource = useMemo(
    () => createHistoryValueSource<boolean>(store, historyCanRetryRefreshAtom),
    [store],
  )
  const stack = useSpreadsheetValue(stackSource)
  const lifecycle = useSpreadsheetValue(lifecycleSource)
  const canUndo = useSpreadsheetValue(canUndoSource)
  const canRedo = useSpreadsheetValue(canRedoSource)
  const canRetryRefresh = useSpreadsheetValue(canRetryRefreshSource)

  const undo = useCallback(
    (input: SpreadsheetHistoryCommandInput) =>
      store.setter(runUndoHistoryAtom, { ...input, source: backend }),
    [backend, store],
  )
  const redo = useCallback(
    (input: SpreadsheetHistoryCommandInput) =>
      store.setter(runRedoHistoryAtom, { ...input, source: backend }),
    [backend, store],
  )
  const retryRefresh = useCallback(
    (input: SpreadsheetHistoryCommandInput) => store.setter(retryHistoryRefreshAtom, input),
    [store],
  )
  const clear = useCallback(() => store.setter(clearHistoryAtom), [store])

  return useMemo(
    () => ({
      stack,
      lifecycle,
      canUndo,
      canRedo,
      canRetryRefresh,
      undo,
      redo,
      retryRefresh,
      clear,
    }),
    [canRedo, canRetryRefresh, canUndo, clear, lifecycle, redo, retryRefresh, stack, undo],
  )
}
