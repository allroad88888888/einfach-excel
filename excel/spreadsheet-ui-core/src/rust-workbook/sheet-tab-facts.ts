import type { RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { snapshotSheetDefaults } from '../runtime/sheet-defaults'

const FACT_KEYS = new Set(['hidden', 'tabColor', 'hideGridlines', 'hideHeadings', 'defaults'])

/**
 * 页签与视图状态以原生为准：先清掉旧值，只在隐藏／有颜色／隐藏网格线或标题时才写字段，
 * 旧文件与普通表形状不变。
 */
export function withSheetTabFacts<Sheet extends RustWorkbookSheet>(
  sheet: Sheet,
  workbook: WasmWorkbook,
  index: number,
): Sheet {
  const rest = Object.fromEntries(
    Object.entries(sheet).filter(([key]) => !FACT_KEYS.has(key)),
  ) as unknown as Sheet
  const defaults = snapshotSheetDefaults(workbook.sheet_defaults?.(index))
  const tabColor = workbook.sheet_tab_color?.(index)
  const view = workbook.sheet_view_flags?.(index) ?? 0
  return {
    ...rest,
    ...(defaults ? { defaults } : {}),
    ...(workbook.sheet_hidden?.(index) ? { hidden: true } : {}),
    ...(tabColor ? { tabColor } : {}),
    ...(view & 1 ? { hideGridlines: true } : {}),
    ...(view & 2 ? { hideHeadings: true } : {}),
  }
}
