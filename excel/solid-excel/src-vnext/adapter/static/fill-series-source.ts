// 一句话：按方向读出序列填充的规范源单元格。

import type {
  DisplayCell,
  FillSeriesRequest,
  RangeFormatLayer,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import { getEffectiveFormat, keyFor, numericValue } from '@einfach/spreadsheet-ui-core'
import { invalidFillSeries } from './fill-series-geometry'

export function readCanonicalFillSeriesValue(cell: DisplayCell | undefined): number {
  if (!cell || cell.formula !== undefined || cell.valueKind !== 'number') {
    invalidFillSeries('source cells must be canonical non-formula numbers')
  }

  if (typeof cell.numericValue === 'number' && Number.isFinite(cell.numericValue)) {
    return cell.numericValue
  }
  if (cell.displayValue.trim().length === 0) {
    invalidFillSeries('source cells must contain finite numbers')
  }
  const value = numericValue(cell.displayValue)
  if (value === null) invalidFillSeries('source cells must contain finite numbers')
  return value
}

export function readCanonicalFillSeriesText(cell: DisplayCell | undefined): string {
  if (
    !cell ||
    cell.formula !== undefined ||
    (cell.valueKind !== undefined && cell.valueKind !== 'string')
  ) {
    invalidFillSeries('source cells must be canonical non-formula strings')
  }
  return cell.displayValue
}

export function getOrderedStaticFillSeriesSourceCells(
  sheetCells: Map<string, DisplayCell>,
  cellFormats: Map<string, SpreadsheetCellFormat>,
  rangeFormats: readonly RangeFormatLayer[],
  request: FillSeriesRequest,
): Array<DisplayCell | undefined> {
  const cells: Array<DisplayCell | undefined> = []
  const append = (row: number, col: number) => {
    const stored = sheetCells.get(keyFor(row, col))
    if (!stored) {
      cells.push(undefined)
      return
    }
    const format = getEffectiveFormat(row, col, cellFormats, rangeFormats)
    cells.push(format ? { ...stored, format } : stored)
  }

  if (request.direction === 'down' || request.direction === 'up') {
    for (let row = request.sourceRange.rowStart; row <= request.sourceRange.rowEnd; row += 1) {
      append(row, request.sourceRange.colStart)
    }
  } else {
    for (let col = request.sourceRange.colStart; col <= request.sourceRange.colEnd; col += 1) {
      append(request.sourceRange.rowStart, col)
    }
  }
  return cells
}
