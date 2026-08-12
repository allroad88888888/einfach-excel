import {
  closeFindReplaceAtom,
  copyClipboardAtom,
  cutClipboardAtom,
  openFindReplaceAtom,
  openGoToAtom,
  openPasteSpecialAtom,
  pasteClipboardAtom,
  pasteSpecialCapabilityAtom,
  reportCopyAsStatusAtom,
  runAutoFillAtom,
  selectAllAtom,
  selectionSnapshotAtom,
  togglePrintPreviewAtom,
  workspaceSessionAtom,
  type MenuItemDispatch,
} from '@einfach/spreadsheet-ui-core'
import {
  createHistoryEntryRecorder,
  dispatchCopyAs,
  dispatchRedo,
  dispatchUndo,
  refreshVisibleProjection,
} from '../provider'
import type { MenuBarCommandContext } from './menu-bar-command-context'

/** Dispatches edit-menu commands through existing Core atoms and provider adapters. */
export function dispatchMenuBarEditCommand(
  context: MenuBarCommandContext,
  dispatch: MenuItemDispatch,
): boolean {
  const { backend, createAutoFillController, getActiveSheetId, store } = context
  switch (dispatch.kind) {
    case 'undo':
      void dispatchUndo(store, backend)
      return true
    case 'redo':
      void dispatchRedo(store, backend)
      return true
    case 'cut':
    case 'copy':
    case 'paste': {
      const snapshot = store.getter(selectionSnapshotAtom)
      const sheetId = snapshot.selection.sheetId || getActiveSheetId() || ''
      if (!sheetId) return true
      const input = { source: { sheetId, range: snapshot.range } }
      if (dispatch.kind === 'cut') store.setter(cutClipboardAtom, input)
      else if (dispatch.kind === 'copy') store.setter(copyClipboardAtom, input)
      else store.setter(pasteClipboardAtom, input)
      return true
    }
    case 'edit.pasteSpecial':
      if (store.getter(pasteSpecialCapabilityAtom)) store.setter(openPasteSpecialAtom)
      return true
    case 'edit.copyAs': {
      const snapshot = store.getter(selectionSnapshotAtom)
      const sheetId = snapshot.selection.sheetId || getActiveSheetId() || ''
      if (!sheetId) return true
      void dispatchCopyAs(store, backend, { sheetId, range: snapshot.range }).catch(() => {
        store.setter(reportCopyAsStatusAtom, { kind: 'failed' })
      })
      return true
    }
    case 'fill-selection': {
      const sheetId = store.getter(workspaceSessionAtom).activeSheetId
      if (!sheetId) return true
      const snapshot = store.getter(selectionSnapshotAtom)
      void store.setter(runAutoFillAtom, {
        entrypoint: 'fill-command',
        sheetId,
        selectionRange: { ...snapshot.range },
        direction: dispatch.direction,
        source: createAutoFillController(),
        historyEntryRecorder: createHistoryEntryRecorder(backend),
        refreshProjection: (target) => refreshVisibleProjection(store, backend, target, 'toolbar'),
      })
      return true
    }
    case 'select-all':
      store.setter(selectAllAtom, getActiveSheetId() ?? undefined)
      return true
    case 'delete-cells':
      return true
    case 'open-find-replace':
      store.setter(closeFindReplaceAtom)
      store.setter(openFindReplaceAtom)
      return true
    case 'open-find-replace-replace':
      store.setter(openFindReplaceAtom)
      return true
    case 'edit.goTo':
      store.setter(openGoToAtom)
      return true
    case 'toggle-print-preview':
      store.setter(togglePrintPreviewAtom)
      return true
    default:
      return false
  }
}
