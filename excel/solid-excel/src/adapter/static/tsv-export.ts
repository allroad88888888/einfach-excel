// 一句话：把一块区域导出成 TSV 文本。

import type {
  CellRange,
  DisplayCell,
  RangeTsvExportRequest,
  RangeTsvExportResult,
} from '@einfach/spreadsheet-ui-core'
import {
  estimateUtf8Bytes,
  isCoordInsideRange,
  keyFor,
  normalizeCopyAsHiddenRows,
  toA1,
} from '@einfach/spreadsheet-ui-core'
import { filterTsvBandRows } from '../filter-hidden-rows'
import { compareCells, isCellInsideRange } from './cell-map'
import type { StaticBackendState } from './state'
import { getOrCreateSheetCells } from './state'

type SparseTsvCell = {
  row: number
  col: number
  kind: 'number' | 'text' | 'boolean' | 'error' | 'formula'
  value: string | number | boolean
}

function sparseTsvCellField(cell: SparseTsvCell): string {
  if (cell.kind === 'boolean') return cell.value ? 'TRUE' : 'FALSE'
  return String(cell.value)
}

function sparseCellsToTsv(cells: SparseTsvCell[], range: CellRange): string {
  const fields = new Map<string, string>()
  for (const cell of cells) {
    if (!isCoordInsideRange(cell.row, cell.col, range)) continue
    fields.set(keyFor(cell.row, cell.col), sparseTsvCellField(cell))
  }

  const rows: string[] = []
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    const fieldsInRow: string[] = []
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      fieldsInRow.push(fields.get(keyFor(row, col)) ?? '')
    }
    rows.push(fieldsInRow.join('\t'))
  }
  return rows.join('\n')
}

function displayCellToSparseTsvCell(cell: DisplayCell): SparseTsvCell {
  if (cell.formula !== undefined) {
    return {
      row: cell.row,
      col: cell.col,
      kind: 'formula',
      value: cell.formula,
    }
  }

  switch (cell.valueKind) {
    case 'number':
      return {
        row: cell.row,
        col: cell.col,
        kind: 'number',
        value: Number(cell.displayValue),
      }
    case 'boolean':
      return {
        row: cell.row,
        col: cell.col,
        kind: 'boolean',
        value: cell.displayValue === 'TRUE',
      }
    case 'error':
      return {
        row: cell.row,
        col: cell.col,
        kind: 'error',
        value: cell.displayValue,
      }
    default:
      return {
        row: cell.row,
        col: cell.col,
        kind: 'text',
        value: cell.displayValue,
      }
  }
}

export function exportRangeTsvFromState(
  state: StaticBackendState,
  request: RangeTsvExportRequest,
): RangeTsvExportResult {
  const sheetCells = getOrCreateSheetCells(state, request.sheetId)
  const cells = [...sheetCells.values()]
    .filter((cell) => isCellInsideRange(cell, request.range))
    .sort(compareCells)
    .map(displayCellToSparseTsvCell)

  // Filter-hidden rows never reach the clipboard (§8.2). The set is an INPUT
  // from UI-core, not something this backend looks up — it holds a
  // `setFilterSort` snapshot of its own, and consulting that would make the
  // large-range copy answer from a staler authority than the small-range one.
  const band = filterTsvBandRows(
    sparseCellsToTsv(cells, request.range),
    request.range.rowStart,
    request.range.rowEnd,
    normalizeCopyAsHiddenRows(request.hiddenRows),
  )
  const text = band.text

  return {
    kind: 'range-tsv',
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? state.revision,
    range: {
      rowStart: request.range.rowStart,
      rowEnd: request.range.rowEnd,
      colStart: request.range.colStart,
      colEnd: request.range.colEnd,
    },
    // The marker names the first EMITTED row — it is the anchor paste uses to
    // shift relative references, so pointing it at a row that was filtered
    // away would offset every formula in the paste. Falls back to the raw
    // start when nothing survived (the text is empty, so it anchors nothing).
    originAddr: toA1(band.firstVisibleRow ?? request.range.rowStart, request.range.colStart),
    text,
    estimatedBytes: estimateUtf8Bytes(text),
  }
}
