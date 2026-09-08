import type { RustWorkbookCommands } from './commands'
import { readVisibleProjection } from './visible-projection'
import type { WasmWorkbook } from './wasm-types'

/** 一次 Rust 合并命令返回同修订版投影；拒绝确认时不刷新、不创建 JS 历史。 */
export function changeMerge(
  workbook: WasmWorkbook,
  sheet: number,
  input: RustWorkbookCommands['range.merge']['payload'],
  revision: number,
): RustWorkbookCommands['range.merge']['result'] {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (
    !workbook.merge_cells ||
    !workbook.merged_ranges ||
    !workbook.read_sparse_range ||
    !workbook.snapshot_format_range
  )
    throw new Error('Rust merge command is unavailable.')
  const r = input.range
  const changed = workbook.merge_cells(
    sheet,
    r.rowStart,
    r.colStart,
    r.rowEnd,
    r.colEnd,
    input.action,
    input.discard,
  )
  return {
    changed,
    projection: readVisibleProjection(
      workbook,
      sheet,
      input.projection,
      revision + (changed ? 1 : 0),
    ),
  }
}
