import type { Store } from '@einfach/core'
import {
  focusFormulaBarAtom,
  formulaBarDraftAtom,
  formulaBarStateAtom,
  setFormulaBarDiagnosticAtom,
  setFormulaBarErrorAtom,
  syncFormulaBarAtom,
  type FormulaBarDiagnostic,
  type FormulaBarState,
  type FormulaBarSyncInput,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useMemo } from 'react'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

export interface SpreadsheetFormulaBar {
  /** The UI-core-owned formula bar snapshot for the nearest provider. */
  readonly state: FormulaBarState
  /** The writable draft projection owned by the UI-core formula bar. */
  readonly draft: string
  focus(focused?: boolean): void
  setDraft(draft: string): void
  setDiagnostic(diagnostic: FormulaBarDiagnostic | null): void
  setError(error: FormulaBarState['error']): void
  sync(input: FormulaBarSyncInput): void
}

function createFormulaBarStateSource(store: Store): SpreadsheetValueSource<FormulaBarState> {
  return {
    getSnapshot: () => store.getter(formulaBarStateAtom),
    subscribe: (onStoreChange) => store.sub(formulaBarStateAtom, onStoreChange),
  }
}

function createFormulaBarDraftSource(store: Store): SpreadsheetValueSource<string> {
  return {
    getSnapshot: () => store.getter(formulaBarDraftAtom),
    subscribe: (onStoreChange) => store.sub(formulaBarDraftAtom, onStoreChange),
  }
}

/** Reads and dispatches the formula bar owned by the nearest SpreadsheetUiProvider. */
export function useSpreadsheetFormulaBar(): SpreadsheetFormulaBar {
  const { store } = useSpreadsheetUiCore()
  const stateSource = useMemo(() => createFormulaBarStateSource(store), [store])
  const draftSource = useMemo(() => createFormulaBarDraftSource(store), [store])
  const state = useSpreadsheetValue(stateSource)
  const draft = useSpreadsheetValue(draftSource)

  const focus = useCallback(
    (focused: boolean = true) => store.setter(focusFormulaBarAtom, focused),
    [store],
  )
  const setDraft = useCallback(
    (nextDraft: string) => store.setter(formulaBarDraftAtom, nextDraft),
    [store],
  )
  const setDiagnostic = useCallback(
    (diagnostic: FormulaBarDiagnostic | null) =>
      store.setter(setFormulaBarDiagnosticAtom, diagnostic),
    [store],
  )
  const setError = useCallback(
    (error: FormulaBarState['error']) => store.setter(setFormulaBarErrorAtom, error),
    [store],
  )
  const sync = useCallback(
    (input: FormulaBarSyncInput) => store.setter(syncFormulaBarAtom, input),
    [store],
  )

  return useMemo(
    () => ({ state, draft, focus, setDraft, setDiagnostic, setError, sync }),
    [draft, focus, setDiagnostic, setDraft, setError, state, sync],
  )
}
