import type { RustFilterCommands } from './filter-commands'
import { validFilterRules } from './filter-commands'
import type { WasmWorkbook } from './wasm-types'

/** 原生筛选自己记历史；Worker 不获取所有单元格，也不保存筛选前后副本。 */
export function changeFilter(
  workbook: WasmWorkbook,
  sheet: number,
  columns: number,
  input: RustFilterCommands['sheet.filter']['payload'],
): number {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (
    !['apply', 'clear', 'reapply'].includes(input.action) ||
    (input.action === 'apply' && !validFilterRules(input.rules, columns))
  )
    throw new Error('Choose up to eight different columns with valid filter conditions.')
  if (
    !workbook.applyFilter ||
    !workbook.clearFilter ||
    !workbook.reapplyFilter ||
    !workbook.sheet_visibility ||
    !workbook.history_state ||
    !workbook.read_sparse_range ||
    !workbook.snapshot_format_range
  )
    throw new Error('Rust filter command is unavailable.')
  const result =
    input.action === 'apply'
      ? workbook.applyFilter(sheet, { rules: input.rules })
      : input.action === 'clear'
        ? workbook.clearFilter(sheet)
        : workbook.reapplyFilter(sheet)
  if (!result.ok) throw new Error(result.message || `Filter rejected: ${result.code}`)
  return result.hiddenRows.length
}
