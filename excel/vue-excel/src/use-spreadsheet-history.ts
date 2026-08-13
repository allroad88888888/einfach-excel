import type { Atom, Store } from '@einfach/core'
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
  type SpreadsheetUiCore,
} from '@einfach/spreadsheet-ui-core'
import { watch, type ComputedRef, type ShallowRef } from 'vue'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

/** Caller-provided projection refresh work for one history command. */
export interface SpreadsheetHistoryCommandInput {
  readonly refreshProjection: () => Promise<void>
  readonly timeoutMs?: number
}

/** UI-core-owned history state and commands for the nearest provider. */
export interface SpreadsheetHistory {
  readonly stack: Readonly<ShallowRef<HistoryStackState>>
  readonly lifecycle: Readonly<ShallowRef<HistoryLifecycleState>>
  readonly canUndo: Readonly<ShallowRef<boolean>>
  readonly canRedo: Readonly<ShallowRef<boolean>>
  readonly canRetryRefresh: Readonly<ShallowRef<boolean>>
  undo: (input: SpreadsheetHistoryCommandInput) => Promise<HistoryCommandOutcome>
  redo: (input: SpreadsheetHistoryCommandInput) => Promise<HistoryCommandOutcome>
  retryRefresh: (input: SpreadsheetHistoryCommandInput) => Promise<HistoryCommandOutcome>
  clear: () => boolean
}

function createHistoryValueSource<T>(
  core: ComputedRef<SpreadsheetUiCore>,
  atom: Atom<T>,
): SpreadsheetValueSource<T> {
  return {
    getSnapshot: () => core.value.store.getter(atom) as T,
    subscribe: (onStoreChange) => {
      let activeStore: Store | undefined
      let unsubscribe: () => void = () => undefined
      const stop = watch(
        core,
        (nextCore) => {
          if (nextCore.store === activeStore) return
          unsubscribe()
          activeStore = nextCore.store
          unsubscribe = nextCore.store.sub(atom, onStoreChange)
          onStoreChange()
        },
        { immediate: true },
      )

      return () => {
        stop()
        unsubscribe()
      }
    },
  }
}

/** Reads and dispatches history through the nearest SpreadsheetUiProvider. */
export function useSpreadsheetHistory(): SpreadsheetHistory {
  const core = useSpreadsheetUiCore()
  const stack = useSpreadsheetValue(createHistoryValueSource(core, historyStackAtom)).value
  const lifecycle = useSpreadsheetValue(createHistoryValueSource(core, historyLifecycleAtom)).value
  const canUndo = useSpreadsheetValue(createHistoryValueSource(core, canUndoAtom)).value
  const canRedo = useSpreadsheetValue(createHistoryValueSource(core, canRedoAtom)).value
  const canRetryRefresh = useSpreadsheetValue(
    createHistoryValueSource(core, historyCanRetryRefreshAtom),
  ).value

  return {
    stack,
    lifecycle,
    canUndo,
    canRedo,
    canRetryRefresh,
    undo: (input) =>
      core.value.store.setter(runUndoHistoryAtom, { ...input, source: core.value.backend }),
    redo: (input) =>
      core.value.store.setter(runRedoHistoryAtom, { ...input, source: core.value.backend }),
    retryRefresh: (input) => core.value.store.setter(retryHistoryRefreshAtom, input),
    clear: () => core.value.store.setter(clearHistoryAtom),
  }
}
