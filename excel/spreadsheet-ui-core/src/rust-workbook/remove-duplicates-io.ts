import type { RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'
import type {
  NativeRemoveDuplicatesRequest, RustRemoveDuplicatesApplyRequest, RustRemoveDuplicatesRequest,
  RustRemoveDuplicatesPreviewRequest,
} from './remove-duplicates-commands'

function nativeRequest(sheet: RustWorkbookSheet | undefined,
  input: RustRemoveDuplicatesRequest): NativeRemoveDuplicatesRequest {
  if (!sheet || sheet.index < 0) throw new Error(`Unknown sheet: ${input.sheetId}`)
  return { sheet: sheet.index, range: input.range, columns: input.columns,
    hasHeader: input.hasHeader, comparison: input.comparison,
    rowCount: sheet.rowCount ?? 1_048_576, colCount: sheet.colCount ?? 16_384 }
}

/** 预览是只读原生扫描，携带同一工作簿修订号供确认时核对。 */
export function previewRemoveDuplicates(
  workbook: WasmWorkbook, sheet: RustWorkbookSheet | undefined,
  input: RustRemoveDuplicatesPreviewRequest, revision: number) {
  if (input.expectedRevision !== undefined &&
    (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== revision))
    throw new Error('The workbook changed. Update the preview before browsing results.')
  if (input.sampleOffset !== undefined &&
    (!Number.isSafeInteger(input.sampleOffset) || input.sampleOffset < 0))
    throw new Error('Invalid preview page.')
  if (!workbook.preview_remove_duplicates)
    throw new Error('Rust duplicate preview is unavailable.')
  const request = nativeRequest(sheet, input)
  return { ...workbook.preview_remove_duplicates({ ...request,
    ...(input.sampleOffset === undefined ? {} : { sampleOffset: input.sampleOffset }) }), revision }
}

/** 任何版本／投影错误都在原生删除前拒绝；不重新实现比较或历史。 */
export function applyRemoveDuplicates(workbook: WasmWorkbook, sheet: RustWorkbookSheet | undefined,
  input: RustRemoveDuplicatesApplyRequest, revision: number) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== revision)
    throw new Error('The workbook changed. Preview again before removing duplicates.')
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (!workbook.remove_duplicates || !workbook.read_sparse_range || !workbook.snapshot_format_range)
    throw new Error('Rust duplicate removal or projection is unavailable.')
  return workbook.remove_duplicates(nativeRequest(sheet, input))
}
