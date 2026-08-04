// 一句话：把一个源单元格投影成对外的 DisplayCell。

import type {
  DisplayCell,
  RangeFormatLayer,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneCell,
  formatNumberValue,
  getEffectiveFormat,
  keyFor,
  numericValue,
} from '@einfach/spreadsheet-ui-core'
import type { EvalCellLookup } from '../static-formula-eval'
import { evaluateFormula, formatEvalResult } from '../static-formula-eval'

export function addFormatOnlyCells(
  resultCells: Map<string, DisplayCell>,
  range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number },
  cellFormats: Map<string, SpreadsheetCellFormat>,
  rangeFormats: RangeFormatLayer[],
  filterHiddenRows: ReadonlySet<number> | undefined,
) {
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    // A filter-hidden row must contribute NOTHING to the projection, not even a
    // format-only blank: "in range but with no cells" is exactly the property
    // downstream visible-cell consumers (status-bar aggregates, the hardened
    // dense scans) rely on to tell filtered-away rows from empty ones.
    if (filterHiddenRows?.has(row)) continue

    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const key = keyFor(row, col)
      const existing = resultCells.get(key)
      const format = getEffectiveFormat(row, col, cellFormats, rangeFormats)

      if (existing) {
        if (format) existing.format = format
      } else if (format) {
        resultCells.set(key, {
          row,
          col,
          displayValue: '',
          valueKind: 'blank',
          format,
        })
      }
    }
  }
}

function applyNumberFormatToCell(cell: DisplayCell, workbookLocale: string): void {
  const numberFormat = cell.format?.numberFormat
  if (!numberFormat) return
  if (cell.valueKind === 'error') return
  if (
    cell.valueKind !== 'number' &&
    numberFormat.kind !== 'text' &&
    numberFormat.kind !== 'custom'
  ) {
    return
  }
  if (cell.valueKind === 'number' && !Number.isFinite(cell.numericValue)) return
  const value = cell.valueKind === 'number' ? cell.numericValue! : cell.displayValue
  const locale = cell.format?.locale ?? workbookLocale
  const result = formatNumberValue(numberFormat, value, { locale })
  cell.displayValue = result.text
  if (result.color && !cell.format!.fgColor) {
    cell.format = { ...cell.format!, fgColor: result.color }
  }
}

export function projectSourceCell(
  cell: DisplayCell,
  options: {
    displayRow: number
    displayCol: number
    lookup: EvalCellLookup
    cellFormats: Map<string, SpreadsheetCellFormat>
    rangeFormats: RangeFormatLayer[]
    workbookLocale: string
  },
): DisplayCell {
  const clone = cloneCell(cell)
  clone.row = options.displayRow
  clone.col = options.displayCol

  if (clone.formula) {
    delete clone.numericValue
    // Display row IS the source row now, so the old "anchor the formula on the
    // source row while the cell reports a display row" split is gone, and with
    // it the whole class of `[@Col]` mis-anchoring it existed to work around.
    const result = evaluateFormula(clone.formula, options.lookup, new Set(), {
      row: options.displayRow,
      col: cell.col,
    })
    const formatted = formatEvalResult(result)
    clone.displayValue = formatted.display
    clone.valueKind = formatted.isError ? 'error' : typeof result === 'number' ? 'number' : 'string'
    if (typeof result === 'number' && Number.isFinite(result)) {
      clone.numericValue = result
    }
    if (formatted.isError) {
      clone.error = {
        code: formatted.display.replace(/^#|!$/g, '').toUpperCase(),
        message: formatted.display,
      }
    }
  } else if (clone.valueKind === 'number') {
    if (!Number.isFinite(clone.numericValue)) {
      delete clone.numericValue
      const value = numericValue(clone.displayValue)
      if (value !== null) clone.numericValue = value
    }
  } else {
    delete clone.numericValue
  }

  const format = getEffectiveFormat(
    options.displayRow,
    options.displayCol,
    options.cellFormats,
    options.rangeFormats,
  )
  if (format) clone.format = format

  applyNumberFormatToCell(clone, options.workbookLocale)
  return clone
}
