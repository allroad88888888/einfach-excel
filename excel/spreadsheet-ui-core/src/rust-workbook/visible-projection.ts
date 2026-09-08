import type {
  ProjectionRevision,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '../backend'
import { displayCell } from './cell-io'
import type { WasmWorkbook } from './wasm-types'
import { applyVisibleFormats } from './format-projection'
import { readSizes } from './size-io'

function requiredSparseRead(
  workbook: WasmWorkbook,
): NonNullable<WasmWorkbook['read_sparse_range']> {
  if (workbook.read_sparse_range) return workbook.read_sparse_range
  throw Object.assign(new Error('WasmWorkbook.read_sparse_range is unavailable'), {
    code: 'WASM_METHOD_UNAVAILABLE',
  })
}

function requiredFormatSnapshot(
  workbook: WasmWorkbook,
): NonNullable<WasmWorkbook['snapshot_format_range']> {
  if (workbook.snapshot_format_range) return workbook.snapshot_format_range
  throw Object.assign(new Error('WasmWorkbook.snapshot_format_range is unavailable'), {
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
  const formats = requiredFormatSnapshot(workbook).call(
    workbook,
    sheetIndex,
    request.window.rowStart,
    request.window.colStart,
    request.window.rowEnd,
    request.window.colEnd,
  )
  const visibleCells = cells
    .map(displayCell)
    .filter((cell): cell is NonNullable<typeof cell> => cell !== null)
  return {
    kind: 'visible-window',
    ...(workbook.history_state ? { history: workbook.history_state() } : {}),
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision,
    window: { ...request.window },
    cells: applyVisibleFormats(visibleCells, request.window, formats),
    rowHeights: formats.rowStyles.flatMap(({ index, height }) =>
      height === undefined ? [] : [{ rowIndex: index, heightPx: height }],
    ),
    // 旧测试假件可省略尺寸 API；生产 WASM 提供完整的行列尺寸快照。
    ...(workbook.snapshot_viewport_sizes ? readSizes(workbook, sheetIndex, request.window) : {}),
  }
}
