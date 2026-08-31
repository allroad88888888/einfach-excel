// 一句话：行列插入删除后各类 sheet 事实的坐标位移。

import type {
  DisplayCell,
  RangeFormatLayer,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import { cloneCell, cloneFormat, keyFor } from '@einfach/spreadsheet-ui-core'
import { parseKey } from './cell-map'
import type { StaticBackendState } from './state'

export function shiftDimensionMap(
  sizes: Map<number, number>,
  index: number,
  count: number,
  direction: 1 | -1,
) {
  const next = new Map<number, number>()
  const deleteEnd = index + count - 1

  for (const [sizeIndex, size] of sizes) {
    if (direction === -1 && sizeIndex >= index && sizeIndex <= deleteEnd) {
      continue
    }

    const nextIndex =
      sizeIndex >= (direction === 1 ? index : deleteEnd + 1)
        ? sizeIndex + count * direction
        : sizeIndex
    if (nextIndex >= 0) {
      next.set(nextIndex, size)
    }
  }

  sizes.clear()
  for (const [sizeIndex, size] of next) sizes.set(sizeIndex, size)
}

export function shiftRows(
  cells: Map<string, DisplayCell>,
  cellFormats: Map<string, SpreadsheetCellFormat>,
  rangeFormats: RangeFormatLayer[],
  rowIndex: number,
  count: number,
  direction: 1 | -1,
) {
  const next = new Map<string, DisplayCell>()
  const nextFormats = new Map<string, SpreadsheetCellFormat>()
  const deleteEnd = rowIndex + count - 1

  for (const cell of cells.values()) {
    if (direction === -1 && cell.row >= rowIndex && cell.row <= deleteEnd) {
      continue
    }
    const row =
      cell.row >= (direction === 1 ? rowIndex : deleteEnd + 1)
        ? cell.row + count * direction
        : cell.row
    const shifted = { ...cloneCell(cell), row }
    next.set(keyFor(shifted.row, shifted.col), shifted)
  }

  cells.clear()
  for (const [key, cell] of next) cells.set(key, cell)

  for (const [key, format] of cellFormats) {
    const coord = parseKey(key)
    if (!coord) continue
    if (direction === -1 && coord.row >= rowIndex && coord.row <= deleteEnd) {
      continue
    }
    const row =
      coord.row >= (direction === 1 ? rowIndex : deleteEnd + 1)
        ? coord.row + count * direction
        : coord.row
    nextFormats.set(keyFor(row, coord.col), cloneFormat(format))
  }

  cellFormats.clear()
  for (const [key, format] of nextFormats) cellFormats.set(key, format)

  shiftRangeFormats(rangeFormats, 'row', rowIndex, count, direction)
}

export function shiftColumns(
  cells: Map<string, DisplayCell>,
  cellFormats: Map<string, SpreadsheetCellFormat>,
  rangeFormats: RangeFormatLayer[],
  colIndex: number,
  count: number,
  direction: 1 | -1,
) {
  const next = new Map<string, DisplayCell>()
  const nextFormats = new Map<string, SpreadsheetCellFormat>()
  const deleteEnd = colIndex + count - 1

  for (const cell of cells.values()) {
    if (direction === -1 && cell.col >= colIndex && cell.col <= deleteEnd) {
      continue
    }
    const col =
      cell.col >= (direction === 1 ? colIndex : deleteEnd + 1)
        ? cell.col + count * direction
        : cell.col
    const shifted = { ...cloneCell(cell), col }
    next.set(keyFor(shifted.row, shifted.col), shifted)
  }

  cells.clear()
  for (const [key, cell] of next) cells.set(key, cell)

  for (const [key, format] of cellFormats) {
    const coord = parseKey(key)
    if (!coord) continue
    if (direction === -1 && coord.col >= colIndex && coord.col <= deleteEnd) {
      continue
    }
    const col =
      coord.col >= (direction === 1 ? colIndex : deleteEnd + 1)
        ? coord.col + count * direction
        : coord.col
    nextFormats.set(keyFor(coord.row, col), cloneFormat(format))
  }

  cellFormats.clear()
  for (const [key, format] of nextFormats) cellFormats.set(key, format)

  shiftRangeFormats(rangeFormats, 'column', colIndex, count, direction)
}

function shiftRangeFormats(
  rangeFormats: RangeFormatLayer[],
  axis: 'row' | 'column',
  index: number,
  count: number,
  direction: 1 | -1,
) {
  const startKey = axis === 'row' ? 'rowStart' : 'colStart'
  const endKey = axis === 'row' ? 'rowEnd' : 'colEnd'
  const deleteEnd = index + count - 1

  for (let layerIndex = rangeFormats.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = rangeFormats[layerIndex]
    const start = layer.range[startKey]
    const end = layer.range[endKey]

    if (direction === 1) {
      if (start >= index) {
        layer.range[startKey] = start + count
        layer.range[endKey] = end + count
      } else if (end >= index) {
        layer.range[endKey] = end + count
      }
      continue
    }

    if (end < index) {
      continue
    }
    if (start > deleteEnd) {
      layer.range[startKey] = start - count
      layer.range[endKey] = end - count
      continue
    }

    const beforeEnd = Math.min(end, index - 1)
    const afterStart = Math.max(start, deleteEnd + 1)
    const hasBefore = start <= beforeEnd
    const hasAfter = afterStart <= end
    if (!hasBefore && !hasAfter) {
      rangeFormats.splice(layerIndex, 1)
      continue
    }

    layer.range[startKey] = hasBefore ? start : afterStart - count
    layer.range[endKey] = hasAfter ? end - count : beforeEnd
  }
}

// Excel merge semantics for structural displacement: an insert before a
// merge shifts it whole, an insert strictly inside extends it; a delete
// before it shifts it back, a partial overlap shrinks it, and a delete
// covering the whole merge removes it. A merge that shrinks to a single
// cell stops being a merge (a 1x1 "merge" is meaningless in Excel).
export function shiftMergeRanges(
  state: StaticBackendState,
  sheetId: string,
  axis: 'row' | 'column',
  index: number,
  count: number,
  direction: 1 | -1,
) {
  const ranges = state.mergeRangesBySheetId.get(sheetId)
  if (!ranges || ranges.length === 0) return
  const startKey = axis === 'row' ? 'rowStart' : 'colStart'
  const endKey = axis === 'row' ? 'rowEnd' : 'colEnd'
  const deleteEnd = index + count - 1

  for (let rangeIndex = ranges.length - 1; rangeIndex >= 0; rangeIndex -= 1) {
    const range = ranges[rangeIndex]
    const start = range[startKey]
    const end = range[endKey]

    if (direction === 1) {
      if (start >= index) {
        range[startKey] = start + count
        range[endKey] = end + count
      } else if (end >= index) {
        range[endKey] = end + count
      }
      continue
    }

    if (end < index) continue
    if (start > deleteEnd) {
      range[startKey] = start - count
      range[endKey] = end - count
      continue
    }

    const hasBefore = start < index
    const hasAfter = end > deleteEnd
    if (!hasBefore && !hasAfter) {
      ranges.splice(rangeIndex, 1)
      continue
    }

    range[startKey] = hasBefore ? start : index
    range[endKey] = hasAfter ? end - count : index - 1
    if (range.rowStart === range.rowEnd && range.colStart === range.colEnd) {
      ranges.splice(rangeIndex, 1)
    }
  }
}

// Freeze counts describe the frozen leading band [0, rows) / [0, cols).
// Inserting strictly above/left of the freeze line (index < frozen)
// grows the band; deleting indices inside the band shrinks it by the
// overlap. Operations at or past the freeze line leave it untouched.
export function shiftFreezeConfig(
  state: StaticBackendState,
  sheetId: string,
  axis: 'row' | 'column',
  index: number,
  count: number,
  direction: 1 | -1,
) {
  const freeze = state.freezeBySheetId.get(sheetId)
  if (!freeze) return
  const key = axis === 'row' ? 'rows' : 'cols'
  const frozen = freeze[key]
  if (frozen <= 0 || index >= frozen) return
  freeze[key] =
    direction === 1 ? frozen + count : frozen - (Math.min(index + count, frozen) - index)
}
