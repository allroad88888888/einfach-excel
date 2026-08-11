import {
  activateSheetTabAtom,
  activeCellFormatAtom,
  clipboardStateAtom,
  dispatchKeyboardInputAtom,
  exitFormulaReferenceAtom,
  formulaReferenceSessionAtom,
  getAdjacentSheetId,
  openFindReplaceAtom,
  openFormatCellsAtom,
  openGoToAtom,
  openMenuAtom,
  openPasteSpecialAtom,
  pasteSpecialCapabilityAtom,
  pickFormulaReferenceAtom,
  reapplyFilterAtom,
  scrollToCellAtom,
  selectionSnapshotAtom,
  sheetTabsSheetsAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import {
  dispatchCopyAs,
  dispatchCopyAsImage,
  dispatchRedo,
  dispatchUndo,
  refreshVisibleProjection,
} from '../provider'
import type { GridClipboardApi } from './grid-clipboard'
import type { GridContextMenuApi } from './grid-context-menu'
import type { GridEditNavigationApi } from './grid-edit-navigation'
import type { GridEditingControllerApi } from './grid-editing-controller'
import type { GridFormatControllerApi } from './grid-format-controller'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridViewStateApi } from './grid-view-state'

type GridKeyboardControllerRuntime = GridRuntimeBase &
  Pick<GridContextMenuApi, 'getKeyboardContextMenuInput'> &
  Pick<GridEditNavigationApi, 'getDataEdgeDirection' | 'moveSelectionToDataEdge' | 'startEditingCell'> &
  Pick<GridViewStateApi, 'selectionSnapshot'> &
  Pick<GridEditingControllerApi, 'clearSelectionRange'> &
  Pick<GridClipboardApi, 'copySelectionToClipboard' | 'pasteFromClipboard'> &
  Pick<GridFormatControllerApi, 'toggleActiveFormatField'>

export function installGridKeyboardController(runtime: GridKeyboardControllerRuntime) {
  const { props, store, backend, getKeyboardContextMenuInput, getDataEdgeDirection, moveSelectionToDataEdge, selectionSnapshot, startEditingCell, clearSelectionRange, copySelectionToClipboard, pasteFromClipboard, toggleActiveFormatField } = runtime

  async function handleGridKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement | null
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
    if ((event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'h') && !event.altKey && !event.shiftKey) {
      event.preventDefault()
      store.setter(openFindReplaceAtom)
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '1' && !event.altKey && !event.shiftKey) {
      event.preventDefault()
      const snapshot = store.getter(selectionSnapshotAtom)
      if (snapshot.selection.sheetId) store.setter(openFormatCellsAtom, { sheetId: snapshot.selection.sheetId, range: snapshot.range, initialFormat: store.getter(activeCellFormatAtom) })
      return
    }
    const dataEdgeDirection = getDataEdgeDirection(event.key)
    if (dataEdgeDirection && !event.altKey && (event.ctrlKey || event.metaKey) && backend.resolveDataEdge && await moveSelectionToDataEdge(event, dataEdgeDirection)) return
    const pageRows = Math.max(1, Math.floor(props.viewport.viewportHeight / Math.max(1, props.viewport.rowHeight)))
    const pageCols = Math.max(1, Math.floor(props.viewport.viewportWidth / Math.max(1, props.viewport.colWidth)))
    const intent = store.setter(dispatchKeyboardInputAtom, { key: event.key, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, isComposing: event.isComposing, pageRowDelta: pageRows, pageColDelta: pageCols })
    switch (intent.type) {
      case 'context-menu.open': {
        const input = getKeyboardContextMenuInput()
        if (!input || store.setter(openMenuAtom, input).status !== 'open') return
        event.preventDefault(); return
      }
      case 'selection.move': event.preventDefault(); if (intent.scroll) store.setter(scrollToCellAtom, { coord: intent.scroll.target }); return
      case 'selection.selectAll':
      case 'selection.clearNonPrimary': event.preventDefault(); return
      case 'editing.start': { event.preventDefault(); const active = selectionSnapshot().activeCell; startEditingCell(active.row, active.col, 'keyboard', { initialDraft: intent.initialDraft, clearOnStart: intent.clearOnStart }); return }
      case 'cell.clear': event.preventDefault(); await clearSelectionRange(intent.target); return
      case 'go-to.open': event.preventDefault(); store.setter(openGoToAtom); return
      case 'filterSort.reapply': event.preventDefault(); await store.setter(reapplyFilterAtom, { source: backend, entrypoint: 'menu-bar', refreshProjection: (sheetId: string) => refreshVisibleProjection(store, backend, sheetId) }); return
      case 'clipboard.copy': event.preventDefault(); await copySelectionToClipboard('copy'); return
      case 'clipboard.copyAs': { event.preventDefault(); const snapshot = selectionSnapshot(); if (snapshot.selection.sheetId === props.sheetId) await dispatchCopyAs(store, backend, { sheetId: props.sheetId, range: snapshot.range }); return }
      case 'clipboard.copyAsImage': { event.preventDefault(); const snapshot = selectionSnapshot(); if (snapshot.selection.sheetId === props.sheetId) await dispatchCopyAsImage(store, backend, { sheetId: props.sheetId, range: snapshot.range }); return }
      case 'clipboard.cut': event.preventDefault(); await copySelectionToClipboard('cut'); return
      case 'clipboard.paste': event.preventDefault(); await pasteFromClipboard(); return
      case 'clipboard.pasteSpecial': {
        if (!store.getter(pasteSpecialCapabilityAtom)) return
        const clipboard = store.getter(clipboardStateAtom)
        if (!clipboard.source || !clipboard.payload) return
        event.preventDefault(); store.setter(openPasteSpecialAtom); return
      }
      case 'sheet.activate-adjacent': {
        event.preventDefault()
        const nextSheetId = getAdjacentSheetId(store.getter(sheetTabsSheetsAtom), store.getter(workspaceSessionAtom).activeSheetId, intent.direction)
        if (nextSheetId) store.setter(activateSheetTabAtom, { sheetId: nextSheetId })
        return
      }
      case 'history.undo': event.preventDefault(); await dispatchUndo(store, backend); return
      case 'history.redo': event.preventDefault(); await dispatchRedo(store, backend); return
      case 'format.toggle': event.preventDefault(); await toggleActiveFormatField(intent.field); return
      case 'formulaReference.arrowPick': {
        event.preventDefault()
        const session = store.getter(formulaReferenceSessionAtom)
        if (!session) return
        const next = { row: Math.max(0, session.anchorCell.row + intent.rowDelta), col: Math.max(0, session.anchorCell.col + intent.colDelta) }
        store.setter(pickFormulaReferenceAtom, { pickAnchor: next, pickFocus: next, sheetId: session.sheetId, dragging: false })
        return
      }
      case 'formulaReference.exit': event.preventDefault(); store.setter(exitFormulaReferenceAtom, intent.reason); return
      default: return
    }
  }

  return installGridFeature(runtime, { handleGridKeyDown })
}

export type GridKeyboardControllerApi = ReturnType<typeof installGridKeyboardController>
