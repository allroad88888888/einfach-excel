import type { Atom, Store } from '@einfach/core'
import {
  cancelEditingAtom,
  editingDraftAtom,
  editingSessionAtom,
  startEditingAtom,
  type EditingCancelIntent,
  type EditingDraftInput,
  type EditingSessionState,
  type EditingStartInput,
  type SpreadsheetUiCore,
} from '@einfach/spreadsheet-ui-core'
import { watch, type ComputedRef, type ShallowRef } from 'vue'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

function createCoreValueSource<T>(
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

/** The editing state and commands owned by the nearest spreadsheet UI core. */
export interface SpreadsheetEditing {
  readonly session: Readonly<ShallowRef<EditingSessionState>>
  readonly draft: Readonly<ShallowRef<string>>
  start: (input: EditingStartInput) => EditingSessionState
  setDraft: (input: EditingDraftInput) => void
  cancel: () => EditingCancelIntent | null
}

/** Binds a Vue editor surface to the nearest UI-core editing session. */
export function useSpreadsheetEditing(): SpreadsheetEditing {
  const core = useSpreadsheetUiCore()
  const session = useSpreadsheetValue(createCoreValueSource(core, editingSessionAtom)).value
  const draft = useSpreadsheetValue(createCoreValueSource(core, editingDraftAtom)).value

  return {
    session,
    draft,
    start: (input) => core.value.store.setter(startEditingAtom, input),
    setDraft: (input) => {
      core.value.store.setter(editingDraftAtom, input)
    },
    cancel: () => core.value.store.setter(cancelEditingAtom),
  }
}
