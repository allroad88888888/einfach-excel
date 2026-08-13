import type { Store } from '@einfach/core'
import {
  selectionSnapshotAtom,
  type SelectionSnapshot,
  type SpreadsheetUiCore,
} from '@einfach/spreadsheet-ui-core'
import { watch, type ComputedRef, type ShallowRef } from 'vue'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

function createSelectionSource(
  core: ComputedRef<SpreadsheetUiCore>,
): SpreadsheetValueSource<SelectionSnapshot> {
  return {
    getSnapshot: () => core.value.store.getter(selectionSnapshotAtom),
    subscribe: (onStoreChange) => {
      let activeStore: Store | undefined
      let unsubscribe: () => void = () => undefined
      const stop = watch(
        core,
        (nextCore) => {
          if (nextCore.store === activeStore) return
          unsubscribe()
          activeStore = nextCore.store
          unsubscribe = nextCore.store.sub(selectionSnapshotAtom, onStoreChange)
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

/** Reads the nearest provider's canonical selection snapshot through a Vue ref. */
export function useSpreadsheetSelection(): Readonly<ShallowRef<SelectionSnapshot>> {
  const core = useSpreadsheetUiCore()
  return useSpreadsheetValue(createSelectionSource(core)).value
}
