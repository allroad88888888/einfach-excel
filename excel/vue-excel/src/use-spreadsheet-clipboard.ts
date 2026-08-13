import type { Atom, Store } from '@einfach/core'
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
  type SpreadsheetUiCore,
} from '@einfach/spreadsheet-ui-core'
import { watch, type ComputedRef, type ShallowRef } from 'vue'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

/** The UI-core clipboard state and commands for the nearest spreadsheet provider. */
export interface SpreadsheetClipboard {
  readonly state: Readonly<ShallowRef<ClipboardState>>
  copy: (input: ClipboardTransferInput) => ClipboardIntent | null
  cut: (input: ClipboardTransferInput) => ClipboardIntent | null
  paste: (input: ClipboardTransferInput) => ClipboardIntent | null
  clear: () => void
  ready: () => void
  setError: (error: ClipboardState['error']) => ClipboardState
}

function createClipboardValueSource<T>(
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

/** Reads and dispatches clipboard state through the nearest SpreadsheetUiProvider. */
export function useSpreadsheetClipboard(): SpreadsheetClipboard {
  const core = useSpreadsheetUiCore()
  const state = useSpreadsheetValue(createClipboardValueSource(core, clipboardStateAtom)).value

  return {
    state,
    copy: (input) => core.value.store.setter(copyClipboardAtom, input),
    cut: (input) => core.value.store.setter(cutClipboardAtom, input),
    paste: (input) => core.value.store.setter(pasteClipboardAtom, input),
    clear: () => core.value.store.setter(clearClipboardAtom),
    ready: () => core.value.store.setter(markClipboardReadyAtom),
    setError: (error) => core.value.store.setter(setClipboardErrorAtom, error),
  }
}
