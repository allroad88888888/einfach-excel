// 一句话：按区域清除单元格的值或格式。

import type {
  CellRange,
  ClearRangeRequest,
  DisplayCell,
  RangeFormatLayer,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneRange,
  isCoordInsideRange,
  normalizeRange,
  rangesIntersect,
} from '@einfach/spreadsheet-ui-core'
import { isCellInsideRange, parseKey } from './cell-map'
import {
  recordCellFormatsBeforeInRange,
  recordCellsBeforeInRange,
  recordRangeFormatsBefore,
} from './history-record'
import type { StaticBackendState } from './state'
import { getOrCreateCellFormats, getOrCreateRangeFormats, getOrCreateSheetCells } from './state'

function clearRangeValues(cells: Map<string, DisplayCell>, range: CellRange): number {
  let cleared = 0

  for (const [key, cell] of [...cells.entries()]) {
    if (isCellInsideRange(cell, range)) {
      cells.delete(key)
      cleared += 1
    }
  }

  return cleared
}

export function clearRangeFormats(
  cellFormats: Map<string, SpreadsheetCellFormat>,
  rangeFormats: RangeFormatLayer[],
  range: CellRange,
): number {
  let cleared = 0

  for (const [key] of [...cellFormats.entries()]) {
    const coord = parseKey(key)
    if (coord && isCoordInsideRange(coord.row, coord.col, range)) {
      cellFormats.delete(key)
      cleared += 1
    }
  }

  // Mirror Rust set_format_range(null): drop per-cell overrides inside the
  // range (above) and push a default-format layer that supersedes underlying
  // range layers only within the cleared rectangle. Removing layers outright
  // would also strip formatting from cells outside the requested range when a
  // layer spans both.
  const intersects = rangeFormats.some((layer) => rangesIntersect(layer.range, range))
  if (intersects) {
    rangeFormats.push({ range: cloneRange(normalizeRange(range)), format: {} })
    cleared += 1
  }

  return cleared
}

export function applyClearRange(state: StaticBackendState, request: ClearRangeRequest): number {
  const target = request.target ?? 'all'
  let cleared = 0

  if (target === 'values' || target === 'all') {
    recordCellsBeforeInRange(state, request.sheetId, request.range)
    cleared += clearRangeValues(getOrCreateSheetCells(state, request.sheetId), request.range)
  }

  if (target === 'formats' || target === 'all') {
    recordCellFormatsBeforeInRange(state, request.sheetId, request.range)
    recordRangeFormatsBefore(state, request.sheetId)
    cleared += clearRangeFormats(
      getOrCreateCellFormats(state, request.sheetId),
      getOrCreateRangeFormats(state, request.sheetId),
      request.range,
    )
  }

  return cleared
}

export function clearCellFormatsInRange(
  cellFormats: Map<string, SpreadsheetCellFormat>,
  range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number },
) {
  for (const [key] of [...cellFormats.entries()]) {
    const coord = parseKey(key)
    if (coord && isCoordInsideRange(coord.row, coord.col, range)) {
      cellFormats.delete(key)
    }
  }
}
