// 一句话：从表头行派生 Table 的列名。

import type { CellRange } from '@einfach/spreadsheet-ui-core'
import { keyFor } from '@einfach/spreadsheet-ui-core'
import { evaluateFormula, formatEvalResult } from '../../static-formula-eval'
import { evalHiddenRowsForSheet, filterHiddenRowsForSheet } from '../hidden-rows'
import type { StaticBackendState } from '../state'
import { nextAutoColumnName } from './name'
import { makeStructuredRefResolver } from './structured-ref'

function tableHeaderText(
  state: StaticBackendState,
  sheetId: string,
  row: number,
  col: number,
): string {
  const sheetCells = state.cellsBySheet.get(sheetId)
  const cell = sheetCells?.get(keyFor(row, col))
  if (!cell) return ''
  if (cell.formula) {
    const result = evaluateFormula(
      cell.formula,
      {
        get: (r, c) => sheetCells?.get(keyFor(r, c)),
        resolveStructuredRef: makeStructuredRefResolver(state, sheetId),
        hiddenRows: evalHiddenRowsForSheet(state, sheetId),
        filterHiddenRows: filterHiddenRowsForSheet(state, sheetId),
      },
      new Set(),
      { row, col },
    )
    const formatted = formatEvalResult(result)
    return formatted.isError ? '' : formatted.display
  }
  return cell.displayValue
}

/** Read the header row's cell text into column names, disambiguating blanks / duplicates. */
export function deriveTableColumnNames(
  state: StaticBackendState,
  sheetId: string,
  range: CellRange,
): string[] {
  const headerRow = range.rowStart
  const names: string[] = []
  const used = new Set<string>()
  for (let col = range.colStart; col <= range.colEnd; col += 1) {
    const raw = tableHeaderText(state, sheetId, headerRow, col).trim()
    const name = raw === '' || used.has(raw.toUpperCase()) ? nextAutoColumnName(used) : raw
    used.add(name.toUpperCase())
    names.push(name)
  }
  return names
}
