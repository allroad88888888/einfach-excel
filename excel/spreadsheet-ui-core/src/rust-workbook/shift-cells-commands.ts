import type { VisibleProjectionRequest, VisibleProjectionResult } from '../contracts'
import type { CellRange } from '../shared'
import type { WorkerCommand } from '../rust-worker'

/** 插入单元格推开原内容的方向，或删除单元格后补位的方向。 */
export type RustShiftCellsDirection = 'insert-right' | 'insert-down' | 'delete-left' | 'delete-up'

export interface RustShiftCellsRequest {
  readonly sheetId: string
  readonly range: CellRange
  readonly direction: RustShiftCellsDirection
  readonly projection: VisibleProjectionRequest
}

export interface RustShiftCellsCommands {
  readonly 'range.shiftCells': WorkerCommand<
    RustShiftCellsRequest,
    { readonly changed: boolean; readonly projection: VisibleProjectionResult }
  >
}

/** 原生导出；可选是为了让旧 WASM 产物给出明确的不可用错误。 */
export interface ShiftCellsWasm {
  shift_cells?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    direction: string,
  ) => boolean
}
