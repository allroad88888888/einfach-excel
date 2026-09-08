import type { RustWorkbookSheet, RustWorkbookSheetInput } from './commands'
import { importSheetSizes } from './size-io'
import { importSheetVisibility } from './visibility-io'
import type { RustWasmModule, WasmWorkbook } from './wasm-types'

/** WASM 加载后创建唯一工作簿，导入演示页提供的初始元数据。 */
export function initializeWorkbook(
  wasm: RustWasmModule,
  sheets: readonly RustWorkbookSheetInput[],
): { workbook: WasmWorkbook; sheets: RustWorkbookSheet[] } {
  const inputs = sheets.length > 0 ? sheets : [{ name: 'Sheet1' }]
  const workbook = new wasm.WasmWorkbook() as WasmWorkbook
  workbook.rename_sheet(0, inputs[0]?.name ?? 'Sheet1')
  for (const input of inputs.slice(1)) workbook.add_sheet(input.name)
  inputs.forEach((input, index) => importSheetSizes(workbook, index, input))
  inputs.forEach((input, index) => importSheetVisibility(workbook, index, input))
  workbook.history_clear?.('')
  return {
    workbook,
    sheets: inputs.map((input, index) =>
      Object.freeze({
        id: input.id ?? `sheet-${index + 1}`,
        index,
        name: workbook.sheet_name(index),
        ...(workbook.sheet_key ? { key: workbook.sheet_key(index) } : {}),
        ...(input.rowCount ? { rowCount: input.rowCount, colCount: input.colCount } : {}),
      }),
    ),
  }
}
