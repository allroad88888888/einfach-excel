import { encodeSelectionAsPlainText } from '../copy-as'
import { encodeSelectionAsHtml } from '../copy-as/html-encoder'
import { encodeSelectionAsMarkdown } from '../copy-as/markdown-encoder'
import type { RustClipboardExport, RustClipboardExportRequest } from './clipboard-commands'
import type { WasmWorkbook } from './wasm-types'
import { readVisibleProjection } from './visible-projection'

// HTML 编码会建立临时索引，比普通 Rust 快照更耗内存；先限规模，再分配。
const MAX_EXPORT_CELLS = 100_000
const MAX_EXPORT_BYTES = 16 * 1024 * 1024

/** Worker 内从 Rust 读取完整选区，复用视图编码器，只把最终字符串传回浏览器。 */
export function exportClipboard(
  workbook: WasmWorkbook,
  sheet: number,
  request: RustClipboardExportRequest,
): RustClipboardExport {
  const { range, format } = request
  const rows = range.rowEnd - range.rowStart + 1
  const cols = range.colEnd - range.colStart + 1
  if (
    !Object.values(range).every((value) => Number.isSafeInteger(value) && value >= 0) ||
    rows <= 0 ||
    cols <= 0 ||
    range.rowEnd >= 1_048_576 ||
    range.colEnd >= 16_384
  )
    throw new Error('CLIPBOARD_INVALID_RANGE')
  if (rows * cols > MAX_EXPORT_CELLS) throw new Error('CLIPBOARD_TOO_LARGE')
  if (!['text', 'markdown', 'html'].includes(format)) throw new Error('CLIPBOARD_INVALID_MODE')
  const projection = readVisibleProjection(
    workbook,
    sheet,
    {
      kind: 'visible-window',
      sheetId: request.sheetId,
      requestId: 0,
      window: { ...range },
      reason: 'clipboard',
    },
    0,
  )
  const input = {
    cells: projection.cells,
    rect: {
      startRow: range.rowStart,
      endRow: range.rowEnd,
      startCol: range.colStart,
      endCol: range.colEnd,
    },
  }
  const text =
    format === 'markdown' ? encodeSelectionAsMarkdown(input) : encodeSelectionAsPlainText(input)
  const html = format === 'html' ? encodeSelectionAsHtml(input) : undefined
  const encoder = new TextEncoder()
  if (encoder.encode(text).byteLength + encoder.encode(html ?? '').byteLength > MAX_EXPORT_BYTES) {
    throw new Error('CLIPBOARD_TOO_LARGE')
  }
  return { text, ...(html === undefined ? {} : { html }), rows, cols }
}
