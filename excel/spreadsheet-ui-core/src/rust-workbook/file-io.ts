import type { RustWorkbookSheet } from './commands'
import { WORKBOOK_FILE_MAX_BYTES, type WorkbookFileMetadata } from './file-commands'
import type { RustWasmModule, WasmWorkbook } from './wasm-types'

const FORMAT = 'einfach-workbook'
const MAX_ROWS = 1_048_576
const MAX_COLS = 16_384
type Canvas = { readonly rowCount: number; readonly colCount: number }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function titleValue(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new Error('Workbook title must contain 1–256 characters.')
  return value
}

function canvasValue(value: unknown): Canvas {
  if (!record(value) || !Number.isSafeInteger(value.rowCount) ||
    !Number.isSafeInteger(value.colCount) || Number(value.rowCount) < 1 ||
    Number(value.rowCount) > MAX_ROWS || Number(value.colCount) < 1 ||
    Number(value.colCount) > MAX_COLS)
    throw new Error('The workbook file has an invalid sheet canvas.')
  return { rowCount: Number(value.rowCount), colCount: Number(value.colCount) }
}

function checkSize(text: string): void {
  if (text.length > WORKBOOK_FILE_MAX_BYTES ||
    new TextEncoder().encode(text).byteLength > WORKBOOK_FILE_MAX_BYTES)
    throw new Error('Workbook files must be 64 MiB or smaller.')
}

/** 在 Worker 中序列化原生快照，不在主线程维护第二份工作簿模型。 */
export function exportWorkbookFile(
  workbook: WasmWorkbook, sheets: readonly RustWorkbookSheet[], title: string,
): { text: string; filename: string } {
  if (!workbook.snapshot_persistence_v1) throw new Error('Rust workbook export is unavailable.')
  const name = titleValue(title)
  const ordered = [...sheets].sort((a, b) => a.index - b.index)
  if (ordered.length !== workbook.sheet_count() ||
    ordered.some((sheet, index) => sheet.index !== index))
    throw new Error('Workbook sheet metadata is out of date. Try downloading again.')
  const text = JSON.stringify({ format: FORMAT, version: 1, title: name,
    canvases: ordered.map((sheet) => canvasValue({
      rowCount: sheet.rowCount ?? MAX_ROWS, colCount: sheet.colCount ?? MAX_COLS,
    })), workbook: workbook.snapshot_persistence_v1() })
  checkSize(text)
  const filename = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/, '')
  return { text, filename: `${filename || 'Workbook'}.einfach.json` }
}

/** 先恢复到候选实例，原生校验失败时只释放候选，绝不修改当前工作簿。 */
export function openWorkbookFile(
  wasm: RustWasmModule, text: string, idPrefix: string,
): { workbook: WasmWorkbook; metadata: WorkbookFileMetadata } {
  checkSize(text)
  let file: unknown
  try { file = JSON.parse(text) } catch {
    throw new Error('This is not a valid .einfach.json workbook file.')
  }
  if (!record(file) || file.format !== FORMAT || file.version !== 1)
    throw new Error('Unsupported workbook file. Choose an .einfach.json file exported by this app.')
  const title = titleValue(file.title)
  if (!Array.isArray(file.canvases) || !file.canvases.length)
    throw new Error('The workbook file has no sheet canvases.')
  const canvases = file.canvases.map(canvasValue)
  const workbook = new wasm.WasmWorkbook() as WasmWorkbook
  try {
    if (!workbook.restore_persistence_v1) throw new Error('Rust workbook restore is unavailable.')
    // 单元格、公式、格式及其它原生字段全部交由 Rust 校验，不在 TS 重写规则。
    workbook.restore_persistence_v1(file.workbook)
    if (workbook.sheet_count() !== canvases.length)
      throw new Error('The workbook file has mismatched sheet canvases.')
    const sheets = canvases.map((canvas, index) => ({
      ...canvas, id: `${idPrefix}-${index}`, index, name: workbook.sheet_name(index),
      ...(workbook.sheet_key ? { key: workbook.sheet_key(index) } : {}),
    }))
    return { workbook, metadata: { title, sheets } }
  } catch (error) {
    workbook.free?.()
    throw error
  }
}
