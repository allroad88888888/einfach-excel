import type { RustWorkbookCommands, RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { readVisibleProjection } from './visible-projection'

/** 传输边界验证 JS 数值；数量、历史与结构随动只由 Rust 持有。 */
export function changeFreeze(
  workbook: WasmWorkbook,
  sheet: RustWorkbookSheet,
  input: RustWorkbookCommands['sheet.freeze']['payload'],
  revision: number,
): RustWorkbookCommands['sheet.freeze']['result'] {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (
    ![input.rows, input.cols].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    input.rows >= (sheet.rowCount ?? 1_048_576) ||
    input.cols >= (sheet.colCount ?? 16_384)
  )
    throw new Error('Freeze boundary is outside the worksheet.')
  if (
    !workbook.set_frozen_panes ||
    !workbook.frozen_panes ||
    !workbook.read_sparse_range ||
    !workbook.snapshot_format_range
  )
    throw new Error('Rust freeze command is unavailable.')
  const changed = workbook.set_frozen_panes(sheet.index, input.rows, input.cols)
  return {
    changed,
    projection: readVisibleProjection(
      workbook,
      sheet.index,
      input.projection,
      revision + (changed ? 1 : 0),
    ),
  }
}
