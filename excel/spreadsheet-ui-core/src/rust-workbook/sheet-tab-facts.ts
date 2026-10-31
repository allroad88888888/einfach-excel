import type { RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'

/** 页签状态以原生为准：先清掉旧值，只在隐藏／有颜色时才写字段，旧文件与普通表形状不变。 */
export function withSheetTabFacts(
  sheet: RustWorkbookSheet,
  workbook: WasmWorkbook,
  index: number,
): RustWorkbookSheet {
  const rest = Object.fromEntries(
    Object.entries(sheet).filter(([key]) => key !== 'hidden' && key !== 'tabColor'),
  ) as unknown as RustWorkbookSheet
  const tabColor = workbook.sheet_tab_color?.(index)
  return {
    ...rest,
    ...(workbook.sheet_hidden?.(index) ? { hidden: true } : {}),
    ...(tabColor ? { tabColor } : {}),
  }
}
