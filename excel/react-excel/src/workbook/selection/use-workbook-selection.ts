import { useAtomValue } from '@einfach/react'
import { selectionSnapshotAtom, type SelectionSnapshot } from '@einfach/spreadsheet-ui-core'

/** Reads the selection snapshot owned by the nearest WorkbookRuntimeProvider. */
export function useWorkbookSelection(): SelectionSnapshot {
  return useAtomValue(selectionSnapshotAtom)
}
