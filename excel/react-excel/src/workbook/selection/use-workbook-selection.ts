import type { Store } from '@einfach/core'
import { selectionSnapshotAtom, type SelectionSnapshot } from '@einfach/spreadsheet-ui-core'
import { useMemo } from 'react'
import { useWorkbookRuntime } from '../runtime/use-workbook-runtime'
import { useStoreValue, type StoreValueSource } from '../runtime/use-store-value'

function createSelectionSource(store: Store): StoreValueSource<SelectionSnapshot> {
  return {
    getSnapshot: () => store.getter(selectionSnapshotAtom),
    subscribe: (onStoreChange) => store.sub(selectionSnapshotAtom, onStoreChange),
  }
}

/** Reads the selection snapshot owned by the nearest WorkbookRuntimeProvider. */
export function useWorkbookSelection(): SelectionSnapshot {
  const core = useWorkbookRuntime()
  const source = useMemo(() => createSelectionSource(core.store), [core.store])

  return useStoreValue(source)
}
