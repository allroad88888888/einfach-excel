import { encodeSelectionAsPlainText } from '../copy-as'
import { encodeSelectionAsHtml } from '../copy-as/html-encoder'
import { encodeSelectionAsMarkdown } from '../copy-as/markdown-encoder'
import type { DisplayCell } from '../contracts/types'
import type { RustClipboardExport, RustClipboardExportRequest } from './clipboard-commands'
import type { WasmWorkbook } from './wasm-types'
import { readVisibleProjection } from './visible-projection'

// HTML 编码会建立临时索引，比普通 Rust 快照更耗内存；先限规模，再分配。
const MAX_EXPORT_CELLS = 100_000
const MAX_EXPORT_BYTES = 16 * 1024 * 1024

function mergeProjectionCells(
  cells: readonly DisplayCell[],
  mergeAnchors: readonly DisplayCell[] | undefined,
): DisplayCell[] {
  if (!mergeAnchors || mergeAnchors.length === 0) return [...cells]
  const byCoord = new Map<string, DisplayCell>()
  for (const cell of cells) {
    byCoord.set(`${cell.row},${cell.col}`, cell)
  }
  for (const anchor of mergeAnchors) {
    const key = `${anchor.row},${anchor.col}`
    const existing = byCoord.get(key)
    byCoord.set(key, existing ? { ...anchor, ...existing, mergedSpan: anchor.mergedSpan } : anchor)
  }
  return [...byCoord.values()]
}

/** Worker 内从 Rust 读取完整选区（含合并锚点与筛选隐藏行），复用视图编码器输出字符串。 */
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
    cells: mergeProjectionCells(projection.cells, projection.mergeAnchors),
    mergedRanges: projection.mergedRanges,
    hiddenRows: projection.visibility?.filterRows,
    rect: {
      startRow: range.rowStart,
      endRow: range.rowEnd,
      startCol: range.colStart,
      endCol: range.colEnd,
    },
  }
  const visibleRows = rows - (input.hiddenRows ?? [])
    .filter((row) => row >= range.rowStart && row <= range.rowEnd).length
  if (visibleRows === 0) throw new Error('CLIPBOARD_NO_VISIBLE_ROWS')
  const text =
    format === 'markdown' ? encodeSelectionAsMarkdown(input) : encodeSelectionAsPlainText(input)
  const html = format === 'html' ? encodeSelectionAsHtml(input) : undefined
  const encoder = new TextEncoder()
  if (encoder.encode(text).byteLength + encoder.encode(html ?? '').byteLength > MAX_EXPORT_BYTES) {
    throw new Error('CLIPBOARD_TOO_LARGE')
  }
  return { text, ...(html === undefined ? {} : { html }), rows: visibleRows, cols }
}
