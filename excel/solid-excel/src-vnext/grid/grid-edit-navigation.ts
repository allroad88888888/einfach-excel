import { activeCellLockedAtom, selectCellAtom, startEditingAtom } from '@einfach/spreadsheet-ui-core'
import { syncFormulaReferenceCaret } from '../provider'
import { type GridRuntime } from './grid-runtime'

export function installGridEditNavigation(runtime: GridRuntime) {
  const { props, store, backend, getCell, selectionSnapshot, bumpRender } = runtime

  function startEditingCell(row: number, col: number, source: 'keyboard' | 'cell', options?: { initialDraft?: string; clearOnStart?: boolean }) {
    if (store.getter(activeCellLockedAtom)) return
    const cell = getCell(row, col)
    const existingDraft = cell?.formula ?? cell?.displayValue ?? ''
    const draft = options?.clearOnStart === true ? (options.initialDraft ?? '') : options?.initialDraft !== undefined ? `${existingDraft}${options.initialDraft}` : existingDraft
    store.setter(startEditingAtom, { sheetId: props.sheetId, cell: { row, col }, draft, source })
    syncFormulaReferenceCaret(store, draft.length)
    bumpRender()
  }

  function getDataEdgeDirection(key: string): 'up' | 'down' | 'left' | 'right' | null {
    if (key === 'ArrowUp') return 'up'
    if (key === 'ArrowDown') return 'down'
    if (key === 'ArrowLeft') return 'left'
    if (key === 'ArrowRight') return 'right'
    return null
  }

  async function moveSelectionToDataEdge(event: KeyboardEvent, direction: 'up' | 'down' | 'left' | 'right'): Promise<boolean> {
    const snapshot = selectionSnapshot()
    if (snapshot.selection.sheetId !== props.sheetId) return false
    event.preventDefault()
    const result = await backend.resolveDataEdge!({
      kind: 'resolve-data-edge', sheetId: props.sheetId,
      from: { row: snapshot.activeCell.row, col: snapshot.activeCell.col }, direction,
      bounds: { rowCount: props.viewport.rowCount, colCount: props.viewport.colCount },
    })
    store.setter(selectCellAtom, { sheetId: props.sheetId, coord: result.target, extend: event.shiftKey })
    bumpRender()
    return true
  }

  Object.assign(runtime, { startEditingCell, getDataEdgeDirection, moveSelectionToDataEdge })
}
