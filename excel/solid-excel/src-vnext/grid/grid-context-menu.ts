import {
  openMenuAtom,
  pointerSessionAtom,
  selectAllAtom,
  selectCellAtom,
  selectColumnsAtom,
  selectRowsAtom,
  selectionRegionsAtom,
  selectionSnapshotAtom,
  type CellCoord,
  type CellRange,
  type MenuOpenInput,
} from '@einfach/spreadsheet-ui-core'
import { isCoordInRange } from './grid-constants'
import { type GridRuntime } from './grid-runtime'

export function installGridContextMenu(runtime: GridRuntime) {
  const { props, store, selectionSnapshot, editingSession, getSelectionRangeContaining, findMergeAnchorCovering, bumpRender } = runtime

  function isActive(row: number, col: number) {
    const selection = selectionSnapshot()
    return selection.selection.sheetId === props.sheetId && selection.activeCell.row === row && selection.activeCell.col === col
  }

  function isFillHandleHost(row: number, col: number) {
    const selection = selectionSnapshot()
    return selection.selection.sheetId === props.sheetId && selection.range.rowEnd === row && selection.range.colEnd === col
  }

  function isSheetEditing() {
    const editing = editingSession()
    return editing.status === 'drafting' && editing.source?.sheetId === props.sheetId
  }

  function isEditing(row: number, col: number) {
    const editing = editingSession()
    return editing.status === 'drafting' && editing.source?.sheetId === props.sheetId && editing.source.cell.row === row && editing.source.cell.col === col
  }

  function focusGrid() {
    ;(runtime.gridRoot as HTMLDivElement | undefined)?.focus()
  }

  function getKeyboardContextMenuInput(): MenuOpenInput | null {
    const snapshot = store.getter(selectionSnapshotAtom)
    const gridRoot = runtime.gridRoot as HTMLDivElement | undefined
    if (!gridRoot || snapshot.selection.sheetId !== props.sheetId) return null
    const activeCellElement = gridRoot.querySelector<HTMLElement>(`td.spreadsheet-grid-cell[data-row="${snapshot.activeCell.row}"][data-col="${snapshot.activeCell.col}"]`) ?? findMergeAnchorCovering(snapshot.activeCell.row, snapshot.activeCell.col)?.el ?? null
    let anchorElement: HTMLElement | null = activeCellElement
    let input!: Pick<MenuOpenInput, 'surface' | 'target'>
    switch (snapshot.selection.kind) {
      case 'cell': input = { surface: 'cell', target: { kind: 'cell', sheetId: props.sheetId, cell: { row: snapshot.activeCell.row, col: snapshot.activeCell.col } } }; break
      case 'range': {
        const single = snapshot.range.rowStart === snapshot.range.rowEnd && snapshot.range.colStart === snapshot.range.colEnd
        input = { surface: 'cell', target: single ? { kind: 'cell', sheetId: props.sheetId, cell: { row: snapshot.activeCell.row, col: snapshot.activeCell.col } } : { kind: 'range', sheetId: props.sheetId, range: snapshot.range } }
        break
      }
      case 'row': anchorElement = gridRoot.querySelector<HTMLElement>(`.spreadsheet-grid-row-header[data-row="${snapshot.selection.rowFocus}"]`) ?? activeCellElement; input = { surface: 'header', target: { kind: 'row', sheetId: props.sheetId, rowIndex: snapshot.selection.rowFocus } }; break
      case 'column': anchorElement = gridRoot.querySelector<HTMLElement>(`.spreadsheet-grid-col-header[data-col="${snapshot.selection.colFocus}"]`) ?? activeCellElement; input = { surface: 'header', target: { kind: 'column', sheetId: props.sheetId, colIndex: snapshot.selection.colFocus } }; break
      case 'all': anchorElement = gridRoot.querySelector<HTMLElement>('.spreadsheet-grid-corner') ?? activeCellElement; input = { surface: 'header', target: { kind: 'all', sheetId: props.sheetId } }; break
    }
    if (!anchorElement) return null
    const rect = anchorElement.getBoundingClientRect()
    return { ...input, position: { x: rect.left, y: rect.bottom }, source: 'keyboard' }
  }

  function targetFallsWithinSingleAxisSelection(target: { kind: 'row'; row: number } | { kind: 'column'; col: number }): boolean {
    const regions = store.getter(selectionRegionsAtom)
    if (regions.length !== 1) return false
    const region = regions[0]
    if (region?.sheetId !== props.sheetId || region.kind !== target.kind) return false
    if (target.kind === 'row' && region.kind === 'row') return target.row >= Math.min(region.rowAnchor, region.rowFocus) && target.row <= Math.max(region.rowAnchor, region.rowFocus)
    if (target.kind === 'column' && region.kind === 'column') return target.col >= Math.min(region.colAnchor, region.colFocus) && target.col <= Math.max(region.colAnchor, region.colFocus)
    return false
  }

  function openContextMenu(event: MouseEvent, target: { kind: 'cell'; row: number; col: number } | { kind: 'range'; row: number; col: number; range: CellRange } | { kind: 'row'; row: number } | { kind: 'column'; col: number } | { kind: 'all' }) {
    event.preventDefault()
    if (target.kind === 'cell') store.setter(selectCellAtom, { sheetId: props.sheetId, coord: { row: target.row, col: target.col } })
    else if (target.kind === 'row' && !targetFallsWithinSingleAxisSelection(target)) store.setter(selectRowsAtom, { sheetId: props.sheetId, rowAnchor: target.row, rowFocus: target.row })
    else if (target.kind === 'column' && !targetFallsWithinSingleAxisSelection(target)) store.setter(selectColumnsAtom, { sheetId: props.sheetId, colAnchor: target.col, colFocus: target.col })
    else if (target.kind === 'all') store.setter(selectAllAtom, props.sheetId)
    store.setter(openMenuAtom, {
      surface: target.kind === 'cell' || target.kind === 'range' ? 'cell' : 'header',
      target: target.kind === 'cell' ? { kind: 'cell', sheetId: props.sheetId, cell: { row: target.row, col: target.col } } : target.kind === 'range' ? { kind: 'range', sheetId: props.sheetId, range: target.range } : target.kind === 'row' ? { kind: 'row', sheetId: props.sheetId, rowIndex: target.row } : target.kind === 'column' ? { kind: 'column', sheetId: props.sheetId, colIndex: target.col } : { kind: 'all', sheetId: props.sheetId },
      position: { x: event.clientX, y: event.clientY }, source: 'pointer',
    })
    bumpRender()
    focusGrid()
  }

  function getCellContextTarget(row: number, col: number): { kind: 'cell'; row: number; col: number } | { kind: 'range'; row: number; col: number; range: CellRange } {
    const range = getSelectionRangeContaining(row, col)
    if (range && (range.rowStart !== range.rowEnd || range.colStart !== range.colEnd)) return { kind: 'range', row, col, range }
    return { kind: 'cell', row, col }
  }

  function getCellCoordFromPoint(event: PointerEvent): CellCoord | null {
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('td.spreadsheet-grid-cell') as HTMLElement | null
    const gridRoot = runtime.gridRoot as HTMLDivElement | undefined
    if (!cell || !gridRoot?.contains(cell)) return null
    const row = Number(cell.dataset.row)
    const col = Number(cell.dataset.col)
    return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
  }

  function getFillPreviewRange(): CellRange | null {
    const session = store.getter(pointerSessionAtom)
    return session.status === 'active' && session.interaction?.kind === 'fill-handle' && session.interaction.sheetId === props.sheetId ? session.interaction.previewRange : null
  }

  function isFillPreviewCell(row: number, col: number) {
    const previewRange = getFillPreviewRange()
    return previewRange ? isCoordInRange(row, col, previewRange) : false
  }

  Object.assign(runtime, { isActive, isFillHandleHost, isSheetEditing, isEditing, focusGrid, getKeyboardContextMenuInput, targetFallsWithinSingleAxisSelection, openContextMenu, getCellContextTarget, getCellCoordFromPoint, getFillPreviewRange, isFillPreviewCell })
}
