import {
  addSheetTabAtom,
  createInsertColumnsOperation,
  createInsertRowsOperation,
  openCommentSessionAtom,
  openNameManagerAtom,
  runStructureOperationAtom,
  selectionSnapshotAtom,
  type MenuItemDispatch,
  type StructureOperationIntent,
} from '@einfach/spreadsheet-ui-core'
import { refreshVisibleProjection } from '../provider'
import type { MenuBarCommandContext } from './menu-bar-command-context'

/** Dispatches insert-menu commands while leaving mutations to Core command atoms. */
export function dispatchMenuBarInsertCommand(
  context: MenuBarCommandContext,
  dispatch: MenuItemDispatch,
): boolean {
  const { backend, getActiveSheetId, store } = context
  const runStructureOperation = (intent: StructureOperationIntent) => {
    void store.setter(runStructureOperationAtom, {
      intent,
      source: backend,
      refreshProjection: (sheetId) => refreshVisibleProjection(store, backend, sheetId),
    })
  }

  switch (dispatch.kind) {
    case 'open-name-manager':
      store.setter(openNameManagerAtom, { status: 'editing-new' })
      return true
    case 'open-comment-session': {
      const snapshot = store.getter(selectionSnapshotAtom)
      const sheetId = snapshot.selection.sheetId || getActiveSheetId() || ''
      if (sheetId) store.setter(openCommentSessionAtom, { sheetId, cell: snapshot.activeCell })
      return true
    }
    case 'insert-row-above':
    case 'insert-row-below': {
      const sheetId = getActiveSheetId()
      if (!sheetId) return true
      const snapshot = store.getter(selectionSnapshotAtom)
      const rowIndex =
        dispatch.kind === 'insert-row-above' ? snapshot.range.rowStart : snapshot.range.rowEnd + 1
      runStructureOperation(createInsertRowsOperation({ sheetId, rowIndex, count: 1 }))
      return true
    }
    case 'insert-column-left':
    case 'insert-column-right': {
      const sheetId = getActiveSheetId()
      if (!sheetId) return true
      const snapshot = store.getter(selectionSnapshotAtom)
      const colIndex =
        dispatch.kind === 'insert-column-left' ? snapshot.range.colStart : snapshot.range.colEnd + 1
      runStructureOperation(createInsertColumnsOperation({ sheetId, colIndex, count: 1 }))
      return true
    }
    case 'insert-sheet':
      void store.setter(addSheetTabAtom)
      return true
    default:
      return false
  }
}
