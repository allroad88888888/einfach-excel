import {
  dispatchToolbarFormatCommandAtom,
  groupSelectionAtom,
  hideColumnsAtom,
  hideRowsAtom,
  openProtectionUnlockAtom,
  protectSheetAtom,
  selectionSnapshotAtom,
  setFreezeConfigAtom,
  unhideViewportSelectionAtom,
  ungroupSelectionAtom,
  unprotectSheetAtom,
  type MenuItemDispatch,
} from '@einfach/spreadsheet-ui-core'
import type { MenuBarCommandContext } from './menu-bar-command-context'

/** Dispatches format-menu commands through Core's canonical view-state atoms. */
export function dispatchMenuBarFormatCommand(
  context: MenuBarCommandContext,
  dispatch: MenuItemDispatch,
): boolean {
  const { backend, getActiveSheetId, store } = context
  switch (dispatch.kind) {
    case 'toggle-bold':
    case 'toggle-italic': {
      const command = dispatch.kind === 'toggle-bold' ? 'bold' : 'italic'
      store.setter(dispatchToolbarFormatCommandAtom, {
        command,
        sheetId: getActiveSheetId() ?? undefined,
      })
      return true
    }
    case 'toggle-underline':
      return true
    case 'set-fill-color':
      store.setter(dispatchToolbarFormatCommandAtom, {
        command: 'fill-color',
        value: '#ffd966',
        sheetId: getActiveSheetId() ?? undefined,
      })
      return true
    case 'set-text-color':
      store.setter(dispatchToolbarFormatCommandAtom, {
        command: 'text-color',
        value: '#000000',
        sheetId: getActiveSheetId() ?? undefined,
      })
      return true
    case 'hide-rows': {
      const sheetId = getActiveSheetId()
      if (!sheetId) return true
      const snapshot = store.getter(selectionSnapshotAtom)
      const indices = Array.from(
        { length: snapshot.range.rowEnd - snapshot.range.rowStart + 1 },
        (_, offset) => snapshot.range.rowStart + offset,
      )
      store.setter(hideRowsAtom, { sheetId, indices, source: backend })
      return true
    }
    case 'hide-cols': {
      const sheetId = getActiveSheetId()
      if (!sheetId) return true
      const snapshot = store.getter(selectionSnapshotAtom)
      const indices = Array.from(
        { length: snapshot.range.colEnd - snapshot.range.colStart + 1 },
        (_, offset) => snapshot.range.colStart + offset,
      )
      store.setter(hideColumnsAtom, { sheetId, indices, source: backend })
      return true
    }
    case 'unhide-rows':
    case 'unhide-cols':
      store.setter(unhideViewportSelectionAtom, {
        action: dispatch.kind === 'unhide-rows' ? 'unhide-rows' : 'unhide-columns',
        source: backend,
      })
      return true
    case 'freeze-panes': {
      const sheetId = getActiveSheetId()
      if (!sheetId) return true
      const activeCell = store.getter(selectionSnapshotAtom).activeCell
      store.setter(setFreezeConfigAtom, {
        source: backend,
        sheetId,
        rows: activeCell.row,
        cols: activeCell.col,
      })
      return true
    }
    case 'unfreeze-panes': {
      const sheetId = getActiveSheetId()
      if (sheetId) store.setter(setFreezeConfigAtom, { source: backend, sheetId, rows: 0, cols: 0 })
      return true
    }
    case 'protect-sheet': {
      const sheetId = getActiveSheetId()
      if (sheetId) store.setter(protectSheetAtom, { sheetId, source: backend })
      return true
    }
    case 'unprotect-sheet': {
      const sheetId = getActiveSheetId()
      if (sheetId) store.setter(unprotectSheetAtom, { sheetId, source: backend })
      return true
    }
    case 'unlock-range': {
      const sheetId = getActiveSheetId()
      if (sheetId) {
        store.setter(openProtectionUnlockAtom, {
          sheetId,
          range: store.getter(selectionSnapshotAtom).range,
        })
      }
      return true
    }
    case 'outline-group-rows':
    case 'outline-group-cols':
      store.setter(groupSelectionAtom, {
        axis: dispatch.kind === 'outline-group-rows' ? 'row' : 'column',
        source: backend,
      })
      return true
    case 'outline-ungroup-rows':
    case 'outline-ungroup-cols':
      store.setter(ungroupSelectionAtom, {
        axis: dispatch.kind === 'outline-ungroup-rows' ? 'row' : 'column',
        source: backend,
      })
      return true
    default:
      return false
  }
}
