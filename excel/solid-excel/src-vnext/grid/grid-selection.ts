import {
  addSelectionRegionAtom,
  getHiddenColumnsForSheet,
  getHiddenRowsForSheet,
  getSelectionRange,
  selectCellAtom,
  selectionSnapshotAtom,
  setSelectionAtom,
  type CellRange,
  type DisplayCell,
  type SelectionRegion,
  type SelectionState,
} from '@einfach/spreadsheet-ui-core'
import { getWindowIndexes, isCoordInRange, makeCellKey } from './grid-constants'
import { type GridRuntime } from './grid-runtime'

export function installGridSelection(runtime: GridRuntime) {
  const { props, store, projectionSnapshot, visibleWindow, hiddenState, getMergeRangeForCoord, bumpRender, focusGrid } = runtime

  function getCellMap() {
    const map = new Map<string, DisplayCell>()
    for (const cell of projectionSnapshot().result?.cells ?? []) map.set(makeCellKey(cell.row, cell.col), cell)
    return map
  }

  function getRows() {
    const window = visibleWindow()
    const hiddenRows = new Set(getHiddenRowsForSheet(hiddenState(), props.sheetId))
    return getWindowIndexes(window.rowStart, window.rowEnd).filter((row) => !hiddenRows.has(row))
  }

  function getCols() {
    const window = visibleWindow()
    const hiddenCols = new Set(getHiddenColumnsForSheet(hiddenState(), props.sheetId))
    return getWindowIndexes(window.colStart, window.colEnd).filter((col) => !hiddenCols.has(col))
  }

  function getSelectionBounds() {
    return { rowCount: props.viewport.rowCount, colCount: props.viewport.colCount }
  }

  function getSelectionStateRange(selection: SelectionState): CellRange {
    return getSelectionRange(selection, getSelectionBounds())
  }

  function getSelectionRegionsForSheet() {
    return runtime.selectionRegions().filter((selection: SelectionState) => selection.sheetId === props.sheetId)
  }

  function getSelectionRangeContaining(row: number, col: number): CellRange | null {
    for (const region of getSelectionRegionsForSheet()) {
      const range = getSelectionStateRange(region)
      if (isCoordInRange(row, col, range)) return range
    }
    return null
  }

  function isSelected(row: number, col: number) {
    return getSelectionRangeContaining(row, col) !== null
  }

  function isRowSelected(row: number) {
    return getSelectionRegionsForSheet().some((region: SelectionState) => {
      if (region.kind !== 'row' && region.kind !== 'all') return false
      const range = getSelectionStateRange(region)
      return row >= range.rowStart && row <= range.rowEnd
    })
  }

  function isColumnSelected(col: number) {
    return getSelectionRegionsForSheet().some((region: SelectionState) => {
      if (region.kind !== 'column' && region.kind !== 'all') return false
      const range = getSelectionStateRange(region)
      return col >= range.colStart && col <= range.colEnd
    })
  }

  function isAllSelected() {
    return getSelectionRegionsForSheet().some((region: SelectionState) => region.kind === 'all')
  }

  function appendCellSelection(row: number, col: number) {
    store.setter(addSelectionRegionAtom, { region: { kind: 'cell', sheetId: props.sheetId, anchor: { row, col }, focus: { row, col } } })
  }

  function createSelectionForRange(range: CellRange): SelectionRegion {
    if (range.rowStart === range.rowEnd && range.colStart === range.colEnd) {
      return { kind: 'cell', sheetId: props.sheetId, anchor: { row: range.rowStart, col: range.colStart }, focus: { row: range.rowStart, col: range.colStart } }
    }
    return { kind: 'range', sheetId: props.sheetId, anchor: { row: range.rowStart, col: range.colStart }, focus: { row: range.rowEnd, col: range.colEnd } }
  }

  function selectCellRange(range: CellRange) {
    store.setter(setSelectionAtom, createSelectionForRange(range))
  }

  function appendCellRangeSelection(range: CellRange) {
    store.setter(addSelectionRegionAtom, { region: createSelectionForRange(range) })
  }

  function appendRangeSelection(row: number, col: number) {
    const snapshot = store.getter(selectionSnapshotAtom)
    const anchor = snapshot.selection.sheetId === props.sheetId ? snapshot.activeCell : { row, col }
    store.setter(addSelectionRegionAtom, { region: { kind: 'range', sheetId: props.sheetId, anchor, focus: { row, col } } })
  }

  function selectCellFromEvent(row: number, col: number, event: MouseEvent) {
    const mergeRange = getMergeRangeForCoord(row, col)
    if (event.ctrlKey || event.metaKey) {
      if (event.shiftKey) appendRangeSelection(row, col)
      else if (mergeRange) appendCellRangeSelection(mergeRange)
      else appendCellSelection(row, col)
      bumpRender()
      focusGrid()
      return
    }
    if (!event.shiftKey && mergeRange) selectCellRange(mergeRange)
    else store.setter(selectCellAtom, { sheetId: props.sheetId, coord: { row, col }, extend: event.shiftKey })
    bumpRender()
    focusGrid()
  }

  Object.assign(runtime, { getCellMap, getRows, getCols, getSelectionBounds, getSelectionStateRange, getSelectionRegionsForSheet, getSelectionRangeContaining, isSelected, isRowSelected, isColumnSelected, isAllSelected, appendCellSelection, createSelectionForRange, selectCellRange, appendCellRangeSelection, appendRangeSelection, selectCellFromEvent })
}
