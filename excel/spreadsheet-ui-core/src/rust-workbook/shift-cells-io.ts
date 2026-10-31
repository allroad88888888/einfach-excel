import type { RustWorkbookCommands } from './commands'
import type { ShiftCellsWasm } from './shift-cells-commands'
import { readVisibleProjection } from './visible-projection'
import type { WasmWorkbook } from './wasm-types'

/** 一次原生插入/删除单元格并返回同修订版投影；位移、拒绝与历史全部由 Rust 决定。 */
export function shiftCells(
  workbook: WasmWorkbook & ShiftCellsWasm,
  sheet: number,
  input: RustWorkbookCommands['range.shiftCells']['payload'],
  revision: number,
): RustWorkbookCommands['range.shiftCells']['result'] {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (!workbook.shift_cells || !workbook.read_sparse_range || !workbook.snapshot_format_range)
    throw new Error('Rust insert or delete cells command is unavailable.')
  const r = input.range
  const changed = workbook.shift_cells(
    sheet,
    r.rowStart,
    r.colStart,
    r.rowEnd,
    r.colEnd,
    input.direction,
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
