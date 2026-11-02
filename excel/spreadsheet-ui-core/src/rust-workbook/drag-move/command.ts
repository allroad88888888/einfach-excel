import type { VisibleProjectionRequest } from '../../contracts'
import type { WorkerCommand } from '../../rust-worker/types'
import type { CellCoord, CellRange } from '../../shared'
import type { RustWorkbookSheet } from '../commands'
import type { RustSetCellInputResult } from '../mutation-results'
import type { WasmWorkbook } from '../wasm-types'
import { readVisibleProjection } from '../visible-projection'

export interface RustDragTransferRequest {
  readonly sheetId: string
  readonly requestId: number
  readonly source: CellRange
  /** 目标区左上角；尺寸始终等于来源。 */
  readonly target: CellCoord
  readonly copy: boolean
  /** 用户已确认覆盖目标区里的已有内容。 */
  readonly replace: boolean
}

export interface WasmDragMoveQueries {
  drag_transfer_range?: (
    sheet: number, startRow: number, startCol: number, endRow: number, endCol: number,
    targetRow: number, targetCol: number, copy: boolean, replace: boolean,
    rowCount: number, colCount: number,
  ) => Uint32Array | number[]
}

export interface RustDragMoveCommands {
  'range.dragTransfer': WorkerCommand<
    { readonly request: RustDragTransferRequest; readonly projection: VisibleProjectionRequest },
    RustSetCellInputResult
  >
}

/** 一次原生移动／复制事务，连同同修订版可见区一起返回；不读写剪贴板快照槽。 */
export function transferDraggedRange(
  workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustDragMoveCommands['range.dragTransfer']['payload'],
  revision: number,
): RustDragMoveCommands['range.dragTransfer']['result'] {
  const { request, projection } = input
  const sheet = sheets.get(request.sheetId)
  if (!sheet || sheet.index < 0) throw new Error('The worksheet no longer exists.')
  if (projection.sheetId !== request.sheetId)
    throw Object.assign(new Error('Mutation and projection must target the same sheet'), {
      code: 'PROJECTION_SHEET_MISMATCH',
    })
  if (!workbook.drag_transfer_range) throw new Error('Rust drag move is unavailable.')
  const { source, target } = request
  const written = workbook.drag_transfer_range(
    sheet.index, source.rowStart, source.colStart, source.rowEnd, source.colEnd,
    target.row, target.col, request.copy, request.replace,
    sheet.rowCount ?? 1_048_576, sheet.colCount ?? 16_384,
  )
  const [rowStart, colStart, rowEnd, colEnd] = Array.from(written)
  return {
    acknowledgement: {
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision,
      affectedRange: { rowStart, colStart, rowEnd, colEnd },
    },
    projection: readVisibleProjection(workbook, sheet.index, projection, revision),
  }
}
