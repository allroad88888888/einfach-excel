import type { Store } from '@einfach/core'
import { selectionSnapshotAtom, type SelectionSnapshot } from '@einfach/spreadsheet-ui-core'
import { useMemo } from 'react'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

function createSelectionSource(store: Store): SpreadsheetValueSource<SelectionSnapshot> {
  return {
    getSnapshot: () => store.getter(selectionSnapshotAtom),
    subscribe: (onStoreChange) => store.sub(selectionSnapshotAtom, onStoreChange),
  }
}

/** Reads the selection snapshot owned by the nearest SpreadsheetUiProvider. */
export function useSpreadsheetSelection(): SelectionSnapshot {
  const core = useSpreadsheetUiCore()
  const source = useMemo(() => createSelectionSource(core.store), [core.store])

  return useSpreadsheetValue(source)
}
