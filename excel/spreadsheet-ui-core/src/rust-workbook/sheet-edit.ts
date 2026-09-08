import type { RustWorkbookCommands, RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { readVisibleProjection } from './visible-projection'

/** 新增或改名后发布 Rust 返回的工作表身份；不重建工作簿。 */
export function editWorkbookSheet(
  workbook: WasmWorkbook,
  sheets: Map<string, RustWorkbookSheet>,
  input: RustWorkbookCommands['workbook.editSheet']['payload'],
  revision: number,
): RustWorkbookCommands['workbook.editSheet']['result'] {
  const indexFor = (id: string) => {
    const sheet = sheets.get(id)
    if (!sheet || sheet.index < 0)
      throw Object.assign(new Error(`Unknown sheet: ${id}`), { code: 'INVALID_SHEET' })
    return sheet.index
  }
  // 在修改名称前检查投影目标，失败时不能留下半个成功的操作。
  const visibleIndex = input.projection ? indexFor(input.projection.sheetId) : undefined
  const index = workbook.edit_sheet(input.sheetId ? indexFor(input.sheetId) : undefined, input.name)
  const sheet = Object.freeze({
    ...(input.sheetId ? sheets.get(input.sheetId) : {}),
    id: input.sheetId ?? crypto.randomUUID(),
    index,
    name: workbook.sheet_name(index),
    ...(workbook.sheet_key ? { key: workbook.sheet_key(index) } : {}),
    ...(input.rowCount ? { rowCount: input.rowCount, colCount: input.colCount } : {}),
  })
  sheets.set(sheet.id, sheet)
  return {
    sheet,
    revision,
    ...(input.projection && visibleIndex !== undefined
      ? { projection: readVisibleProjection(workbook, visibleIndex, input.projection, revision) }
      : {}),
  }
}
