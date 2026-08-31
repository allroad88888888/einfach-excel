// 一句话：把 Table 注册表项投成对外描述符。

import type { SpreadsheetTableDescriptor } from '@einfach/spreadsheet-ui-core'
import { toA1 } from '@einfach/spreadsheet-ui-core'
import type { StaticBackendState, StaticTableEntry } from '../state'

export function tableDescriptor(
  state: StaticBackendState,
  entry: StaticTableEntry,
): SpreadsheetTableDescriptor {
  const sheetIndex = state.sheets.findIndex((sheet) => sheet.id === entry.sheetId)
  const sheet = sheetIndex >= 0 ? state.sheets[sheetIndex] : undefined
  return {
    name: entry.canonicalName,
    sheetId: entry.sheetId,
    sheetName: sheet?.name ?? '',
    sheetIndex,
    range: `${toA1(entry.range.rowStart, entry.range.colStart)}:${toA1(
      entry.range.rowEnd,
      entry.range.colEnd,
    )}`,
    hasHeaders: entry.hasHeaders,
    hasTotals: entry.hasTotals,
    columns: [...entry.columns],
  }
}
