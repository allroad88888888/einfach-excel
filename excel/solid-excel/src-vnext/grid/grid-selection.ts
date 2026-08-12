import {
  addSelectionRegionAtom,
  getHiddenColumnsForSheet,
  getHiddenRowsForSheet,
  getSelectionRange,
  selectCellAtom,
  selectionSnapshotAtom,
  setSelectionAtom,
  type CellCoord,
  type CellSelection,
  type CellRange,
  type DisplayCell,
  type RangeSelection,
  type SelectionRegion,
  type SelectionState,
} from '@einfach/spreadsheet-ui-core'
import { getWindowIndexes, isCoordInRange, makeCellKey } from './grid-constants'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridFocusPort, GridMergeRangePort } from './grid-runtime-ports'
import type { GridViewStateApi } from './grid-view-state'

type GridSelectionRuntime = GridRuntimeBase &
  Pick<
    GridViewStateApi,
    'projectionSnapshot' | 'visibleWindow' | 'hiddenState' | 'selectionRegions'
  > &
  GridMergeRangePort &
  GridFocusPort

type GridCellSpanSelection = CellSelection | RangeSelection

export function installGridSelection(runtime: GridSelectionRuntime) {
  const { props, store, projectionSnapshot, visibleWindow, hiddenState } = runtime

  // 按投影结果的数组身份 memo：一次渲染里每个格子要查若干次 map，重建的话
  // 是 O(格子数²)（表面级窗口 ~700 格 → 单次重锚渲染数百万次 Map 插入，帧
  // 耗时秒级）。cells 数组在投影结果不变时引用稳定，直接用身份当缓存键。
  let cellMapSource: readonly DisplayCell[] | null = null
  let cellMapCache: Map<string, DisplayCell> = new Map()

  function getCellMap() {
    const cells = projectionSnapshot().result?.cells ?? []
    if (cells !== cellMapSource) {
      const map = new Map<string, DisplayCell>()
      for (const cell of cells) map.set(makeCellKey(cell.row, cell.col), cell)
      cellMapSource = cells
      cellMapCache = map
    }
    return cellMapCache
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
    return runtime
      .selectionRegions()
      .filter((selection: SelectionState) => selection.sheetId === props.sheetId)
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
    store.setter(addSelectionRegionAtom, {
      region: { kind: 'cell', sheetId: props.sheetId, anchor: { row, col }, focus: { row, col } },
    })
  }

  function createSelectionForCoords(anchor: CellCoord, focus: CellCoord): GridCellSpanSelection {
    if (anchor.row === focus.row && anchor.col === focus.col) {
      return { kind: 'cell', sheetId: props.sheetId, anchor, focus }
    }
    return { kind: 'range', sheetId: props.sheetId, anchor, focus }
  }

  function createSelectionForRange(range: CellRange): SelectionRegion {
    return createSelectionForCoords(
      { row: range.rowStart, col: range.colStart },
      { row: range.rowEnd, col: range.colEnd },
    )
  }

  function getCellRangeIncludingMerge(coord: CellCoord): CellRange {
    return (
      runtime.getMergeRangeForCoord(coord.row, coord.col) ?? {
        rowStart: coord.row,
        rowEnd: coord.row,
        colStart: coord.col,
        colEnd: coord.col,
      }
    )
  }

  function createCellSpanSelection(anchor: CellCoord, focus: CellCoord): GridCellSpanSelection {
    const anchorRange = getCellRangeIncludingMerge(anchor)
    const focusRange = getCellRangeIncludingMerge(focus)
    const range = {
      rowStart: Math.min(anchorRange.rowStart, focusRange.rowStart),
      rowEnd: Math.max(anchorRange.rowEnd, focusRange.rowEnd),
      colStart: Math.min(anchorRange.colStart, focusRange.colStart),
      colEnd: Math.max(anchorRange.colEnd, focusRange.colEnd),
    }
    const selectionAnchor = {
      row: focus.row >= anchor.row ? range.rowStart : range.rowEnd,
      col: focus.col >= anchor.col ? range.colStart : range.colEnd,
    }
    const selectionFocus = {
      row: focus.row >= anchor.row ? range.rowEnd : range.rowStart,
      col: focus.col >= anchor.col ? range.colEnd : range.colStart,
    }
    return createSelectionForCoords(selectionAnchor, selectionFocus)
  }

  function selectCellSpan(anchor: CellCoord, focus: CellCoord) {
    const selection = createCellSpanSelection(anchor, focus)
    store.setter(setSelectionAtom, selection)
    return selection
  }

  function getSelectionAnchor(selection: SelectionState): CellCoord {
    switch (selection.kind) {
      case 'cell':
      case 'range':
        return selection.anchor
      case 'row':
        return { row: selection.rowAnchor, col: 0 }
      case 'column':
        return { row: 0, col: selection.colAnchor }
      case 'all':
        return { row: 0, col: 0 }
    }
  }

  function appendCellRangeSelection(range: CellRange) {
    // The Core active cell is a region's focus. Keep it on the visible merge
    // anchor while the reversed endpoints still describe the entire merge.
    const region = createSelectionForCoords(
      { row: range.rowEnd, col: range.colEnd },
      { row: range.rowStart, col: range.colStart },
    )
    store.setter(addSelectionRegionAtom, { region })
  }

  function appendRangeSelection(row: number, col: number) {
    const snapshot = store.getter(selectionSnapshotAtom)
    const focus = { row, col }
    const anchor = snapshot.selection.sheetId === props.sheetId ? snapshot.activeCell : focus
    store.setter(addSelectionRegionAtom, { region: createCellSpanSelection(anchor, focus) })
  }

  function selectCellFromEvent(row: number, col: number, event: MouseEvent) {
    const coord = { row, col }
    const mergeRange = runtime.getMergeRangeForCoord(row, col)
    if (event.ctrlKey || event.metaKey) {
      if (event.shiftKey) appendRangeSelection(row, col)
      else if (mergeRange) appendCellRangeSelection(mergeRange)
      else appendCellSelection(row, col)
      runtime.focusGrid()
      return
    }
    if (event.shiftKey) {
      const snapshot = store.getter(selectionSnapshotAtom)
      if (snapshot.selection.sheetId === props.sheetId) {
        selectCellSpan(getSelectionAnchor(snapshot.selection), coord)
      } else {
        store.setter(selectCellAtom, { sheetId: props.sheetId, coord, extend: false })
      }
    } else if (mergeRange) {
      store.setter(selectCellAtom, {
        sheetId: props.sheetId,
        coord: { row: mergeRange.rowStart, col: mergeRange.colStart },
        extend: false,
      })
    } else {
      store.setter(selectCellAtom, { sheetId: props.sheetId, coord, extend: false })
    }
    runtime.focusGrid()
  }

  return installGridFeature(runtime, {
    getCellMap,
    getRows,
    getCols,
    getSelectionBounds,
    getSelectionStateRange,
    getSelectionRegionsForSheet,
    getSelectionRangeContaining,
    isSelected,
    isRowSelected,
    isColumnSelected,
    isAllSelected,
    appendCellSelection,
    createSelectionForRange,
    createCellSpanSelection,
    selectCellSpan,
    appendCellRangeSelection,
    appendRangeSelection,
    selectCellFromEvent,
  })
}

export type GridSelectionApi = ReturnType<typeof installGridSelection>
