import type { RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'

/** 仅保留身份/画布元数据；index=-1 表示原生归档，绝不在这里保存或回放单元格。 */
export function retainSheetMetadata(
  workbook: WasmWorkbook,
  known: Map<string, RustWorkbookSheet>,
  sheets: readonly RustWorkbookSheet[],
): void {
  const live = new Set(sheets.map((sheet) => sheet.id))
  for (const sheet of known.values()) {
    if (!live.has(sheet.id)) known.set(sheet.id, { ...sheet, index: -1 })
  }
  for (const sheet of sheets) known.set(sheet.id, sheet)
  const history = workbook.history_state?.()
  const retained = new Set(
    history?.entries.flatMap((entry) => [entry.sheetKey, ...(entry.affectedSheetKeys ?? [])]),
  )
  for (const sheet of known.values()) {
    if (sheet.index < 0 && !retained.has(sheet.key)) known.delete(sheet.id)
  }
}

/** 顺序和名称以 Rust 为准；只用原生 key 找回宿主 ID，不按旧位置或同名猜测。 */
export function readSheetMetadata(
  workbook: WasmWorkbook,
  known: Map<string, RustWorkbookSheet>,
): readonly RustWorkbookSheet[] {
  if (!workbook.sheet_key) throw new Error('Rust worksheet identity is unavailable.')
  const byKey = new Map([...known.values()].map((sheet) => [sheet.key, sheet]))
  const sheets = Array.from({ length: workbook.sheet_count() }, (_, index) => {
    const key = workbook.sheet_key!(index)
    const previous = byKey.get(key)
    if (!previous) throw new Error('Rust returned an unknown worksheet identity.')
    return { ...previous, index, name: workbook.sheet_name(index) }
  })
  retainSheetMetadata(workbook, known, sheets)
  return sheets
}
