import type { Atom, Store } from '@einfach/core'
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
  type SpreadsheetError,
  type SpreadsheetUiCore,
} from '@einfach/spreadsheet-ui-core'
import { watch, type ComputedRef, type ShallowRef } from 'vue'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

function createFormulaBarValueSource<T>(
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

/** Formula-bar state and commands owned by the nearest spreadsheet UI core. */
export interface SpreadsheetFormulaBar {
  readonly draft: Readonly<ShallowRef<string>>
  readonly state: Readonly<ShallowRef<FormulaBarState>>
  focus: (focused?: boolean) => void
  setDiagnostic: (diagnostic: FormulaBarDiagnostic | null) => void
  setDraft: (draft: string) => void
  setError: (error: SpreadsheetError | null) => void
  sync: (input: FormulaBarSyncInput) => void
}

/** Binds a Vue formula bar to the nearest UI-core formula-bar atoms. */
export function useSpreadsheetFormulaBar(): SpreadsheetFormulaBar {
  const core = useSpreadsheetUiCore()
  const state = useSpreadsheetValue(createFormulaBarValueSource(core, formulaBarStateAtom)).value
  const draft = useSpreadsheetValue(createFormulaBarValueSource(core, formulaBarDraftAtom)).value

  return {
    state,
    draft,
    focus: (focused = true) => core.value.store.setter(focusFormulaBarAtom, focused),
    setDraft: (nextDraft) => {
      core.value.store.setter(formulaBarDraftAtom, nextDraft)
    },
    sync: (input) => core.value.store.setter(syncFormulaBarAtom, input),
    setDiagnostic: (diagnostic) => core.value.store.setter(setFormulaBarDiagnosticAtom, diagnostic),
    setError: (error) => core.value.store.setter(setFormulaBarErrorAtom, error),
  }
}
