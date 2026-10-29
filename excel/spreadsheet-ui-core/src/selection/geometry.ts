import { EXCEL_MAX_ROWS, EXCEL_MAX_COLS } from '../shared/grid-coordinates'
import type { CellCoord, CellRange } from '../shared'
import type {
  ActiveSelectionCell,
  CellSelection,
  MoveSelectionInput,
  RangeSelection,
  SelectionBounds,
  SelectionState,
} from './types'

export const DEFAULT_SELECTION_BOUNDS: SelectionBounds = Object.freeze({
  rowCount: EXCEL_MAX_ROWS,
  colCount: EXCEL_MAX_COLS,
})

export const DEFAULT_SELECTION_STATE: CellSelection = Object.freeze({
  kind: 'cell',
  sheetId: '',
  anchor: Object.freeze({ row: 0, col: 0 }),
  focus: Object.freeze({ row: 0, col: 0 }),
})

export function normalizeSelectionBounds(bounds: SelectionBounds): SelectionBounds {
  return {
    rowCount: normalizeCount(bounds.rowCount, EXCEL_MAX_ROWS),
    colCount: normalizeCount(bounds.colCount, EXCEL_MAX_COLS),
  }
}

export function clampCellCoord(coord: CellCoord, bounds: SelectionBounds): CellCoord {
  const normalizedBounds = normalizeSelectionBounds(bounds)

  return {
    row: clampIndex(coord.row, normalizedBounds.rowCount),
    col: clampIndex(coord.col, normalizedBounds.colCount),
  }
}

export function normalizeSelection(
  selection: SelectionState,
  bounds: SelectionBounds = DEFAULT_SELECTION_BOUNDS,
): SelectionState {
  const normalizedBounds = normalizeSelectionBounds(bounds)

  switch (selection.kind) {
    case 'cell': {
      const cell = clampCellCoord(selection.focus, normalizedBounds)
      return {
        kind: 'cell',
        sheetId: selection.sheetId,
        anchor: cell,
        focus: cell,
      }
    }
    case 'range': {
      const anchor = clampCellCoord(selection.anchor, normalizedBounds)
      const focus = clampCellCoord(selection.focus, normalizedBounds)

      if (sameCoord(anchor, focus)) {
        return {
          kind: 'cell',
          sheetId: selection.sheetId,
          anchor,
          focus,
        }
      }

      return {
        kind: 'range',
        sheetId: selection.sheetId,
        anchor,
        focus,
      }
    }
    case 'row':
      return {
        kind: 'row',
        sheetId: selection.sheetId,
        rowAnchor: clampIndex(selection.rowAnchor, normalizedBounds.rowCount),
        rowFocus: clampIndex(selection.rowFocus, normalizedBounds.rowCount),
      }
    case 'column':
      return {
        kind: 'column',
        sheetId: selection.sheetId,
        colAnchor: clampIndex(selection.colAnchor, normalizedBounds.colCount),
        colFocus: clampIndex(selection.colFocus, normalizedBounds.colCount),
      }
    case 'all':
      return {
        kind: 'all',
        sheetId: selection.sheetId,
      }
    default:
      return assertNever(selection)
  }
}

export function getSelectionRange(
  selection: SelectionState,
  bounds: SelectionBounds = DEFAULT_SELECTION_BOUNDS,
): CellRange {
  const normalizedBounds = normalizeSelectionBounds(bounds)
  const normalizedSelection = normalizeSelection(selection, normalizedBounds)

  switch (normalizedSelection.kind) {
    case 'cell':
    case 'range':
      return normalizeCellRange(normalizedSelection.anchor, normalizedSelection.focus)
    case 'row': {
      const rowStart = Math.min(normalizedSelection.rowAnchor, normalizedSelection.rowFocus)
      const rowEnd = Math.max(normalizedSelection.rowAnchor, normalizedSelection.rowFocus)

      return {
        rowStart,
        rowEnd,
        colStart: 0,
        colEnd: normalizedBounds.colCount - 1,
      }
    }
    case 'column': {
      const colStart = Math.min(normalizedSelection.colAnchor, normalizedSelection.colFocus)
      const colEnd = Math.max(normalizedSelection.colAnchor, normalizedSelection.colFocus)

      return {
        rowStart: 0,
        rowEnd: normalizedBounds.rowCount - 1,
        colStart,
        colEnd,
      }
    }
    case 'all':
      return {
        rowStart: 0,
        rowEnd: normalizedBounds.rowCount - 1,
        colStart: 0,
        colEnd: normalizedBounds.colCount - 1,
      }
    default:
      return assertNever(normalizedSelection)
  }
}

export function getActiveCell(
  selection: SelectionState,
  bounds: SelectionBounds = DEFAULT_SELECTION_BOUNDS,
): ActiveSelectionCell {
  const normalizedSelection = normalizeSelection(selection, bounds)

  switch (normalizedSelection.kind) {
    case 'cell':
    case 'range':
      return {
        sheetId: normalizedSelection.sheetId,
        row: normalizedSelection.focus.row,
        col: normalizedSelection.focus.col,
      }
    case 'row':
      return {
        sheetId: normalizedSelection.sheetId,
        row: normalizedSelection.rowFocus,
        col: 0,
      }
    case 'column':
      return {
        sheetId: normalizedSelection.sheetId,
        row: 0,
        col: normalizedSelection.colFocus,
      }
    case 'all':
      return {
        sheetId: normalizedSelection.sheetId,
        row: 0,
        col: 0,
      }
    default:
      return assertNever(normalizedSelection)
  }
}

export function moveSelection(
  selection: SelectionState,
  bounds: SelectionBounds,
  input: MoveSelectionInput,
): SelectionState {
  const normalizedSelection = normalizeSelection(selection, bounds)
  const activeCell = getActiveCell(normalizedSelection, bounds)
  const target = clampCellCoord(
    {
      row: input.row ?? activeCell.row + (input.rowDelta ?? 0),
      col: input.col ?? activeCell.col + (input.colDelta ?? 0),
    },
    bounds,
  )

  if (!input.extend) {
    return {
      kind: 'cell',
      sheetId: normalizedSelection.sheetId,
      anchor: target,
      focus: target,
    }
  }

  const anchor = getSelectionAnchorCell(normalizedSelection, bounds)
  const nextSelection: RangeSelection = {
    kind: 'range',
    sheetId: normalizedSelection.sheetId,
    anchor,
    focus: target,
  }

  return normalizeSelection(nextSelection, bounds)
}

function normalizeCellRange(anchor: CellCoord, focus: CellCoord): CellRange {
  return {
    rowStart: Math.min(anchor.row, focus.row),
    rowEnd: Math.max(anchor.row, focus.row),
    colStart: Math.min(anchor.col, focus.col),
    colEnd: Math.max(anchor.col, focus.col),
  }
}

export function getSelectionAnchorCell(
  selection: SelectionState,
  bounds: SelectionBounds,
): CellCoord {
  const normalizedSelection = normalizeSelection(selection, bounds)

  switch (normalizedSelection.kind) {
    case 'cell':
    case 'range':
      return normalizedSelection.anchor
    case 'row':
      return {
        row: normalizedSelection.rowAnchor,
        col: 0,
      }
    case 'column':
      return {
        row: 0,
        col: normalizedSelection.colAnchor,
      }
    case 'all':
      return {
        row: 0,
        col: 0,
      }
    default:
      return assertNever(normalizedSelection)
  }
}

function normalizeCount(value: number, max: number): number {
  if (!Number.isSafeInteger(value)) {
    return 1
  }

  return Math.max(1, Math.min(value, max))
}

function clampIndex(value: number, maxExclusive: number): number {
  if (!Number.isSafeInteger(value)) {
    return 0
  }

  return Math.max(0, Math.min(value, maxExclusive - 1))
}

export function sameCoord(left: CellCoord, right: CellCoord): boolean {
  return left.row === right.row && left.col === right.col
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled selection state: ${JSON.stringify(value)}`)
}
