import type {
  ProjectionRevision,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '../backend'
import { displayCell } from './cell-io'
import type { WasmWorkbook } from './wasm-types'

function requiredSparseRead(
  workbook: WasmWorkbook,
): NonNullable<WasmWorkbook['read_sparse_range']> {
  if (workbook.read_sparse_range) return workbook.read_sparse_range
  throw Object.assign(new Error('WasmWorkbook.read_sparse_range is unavailable'), {
    code: 'WASM_METHOD_UNAVAILABLE',
  })
}

/** 从一个 Rust 工作簿修订版生成指定窗口的稀疏 UI 投影。 */
export function readVisibleProjection(
  workbook: WasmWorkbook,
  sheetIndex: number,
  request: VisibleProjectionRequest,
  revision: ProjectionRevision,
): VisibleProjectionResult {
  const read = requiredSparseRead(workbook)
  const cells = read.call(
    workbook,
    sheetIndex,
    request.window.rowStart,
    request.window.colStart,
    request.window.rowEnd,
    request.window.colEnd,
  )
  return {
    kind: 'visible-window',
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision,
    window: { ...request.window },
    cells: cells
      .map(displayCell)
      .filter((cell): cell is NonNullable<typeof cell> => cell !== null)
      .sort((left, right) => left.row - right.row || left.col - right.col),
  }
}
