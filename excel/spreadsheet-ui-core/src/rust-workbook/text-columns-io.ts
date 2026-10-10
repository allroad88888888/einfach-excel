import type { RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'
import type {
  NativeTextColumnsRequest, RustTextColumnsApplyRequest, RustTextColumnsRequest,
} from './text-columns-commands'

function nativeRequest(
  sheet: RustWorkbookSheet | undefined, input: RustTextColumnsRequest,
): NativeTextColumnsRequest {
  if (!sheet || sheet.index < 0) throw new Error(`Unknown sheet: ${input.sheetId}`)
  return {
    sheet: sheet.index, source: input.source, destination: input.destination, mode: input.mode,
    rowCount: sheet.rowCount ?? 1_048_576, colCount: sheet.colCount ?? 16_384,
  }
}

/** 只返回原生有界样本及版本，预览不发布投影、不创建历史。 */
export function previewTextColumns(
  workbook: WasmWorkbook, sheet: RustWorkbookSheet | undefined,
  input: RustTextColumnsRequest, revision: number,
) {
  if (!workbook.preview_text_columns) throw new Error('Rust text-to-columns preview is unavailable.')
  return { ...workbook.preview_text_columns(nativeRequest(sheet, input)), revision }
}

/** 版本与投影目标必须在原生写入之前检查；历史仅由 Rust 持有。 */
export function applyTextColumns(
  workbook: WasmWorkbook, sheet: RustWorkbookSheet | undefined,
  input: RustTextColumnsApplyRequest, revision: number,
) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== revision)
    throw new Error('The workbook changed. Preview again before splitting text.')
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (!workbook.split_text_columns || !workbook.read_sparse_range ||
    !workbook.snapshot_format_range)
    throw new Error('Rust text-to-columns command or projection is unavailable.')
  return workbook.split_text_columns(nativeRequest(sheet, input), input.overwrite)
}
