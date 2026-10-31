import type { RustWorkbookCommands } from './commands'
import type { WasmWorkbook } from './wasm-types'

type VisibleInput = RustWorkbookCommands['selection.visibleBlocks']['payload']
type RegionInput = RustWorkbookCommands['selection.currentRegion']['payload']

/** 把稳定 sheetId 换成原生表索引后转发给对应的 Rust 只读查询。 */
export function selectSpecialQuery(
  workbook: WasmWorkbook,
  command: 'selection.visibleBlocks' | 'selection.currentRegion',
  payload: unknown,
  sheetIndex: (sheetId: string) => number,
  revision: number,
) {
  if (command === 'selection.visibleBlocks') {
    const { sheetId, ...input } = payload as VisibleInput
    if (!workbook.select_visible_cells) throw new Error('Rust visible-cells command is unavailable.')
    return { ...workbook.select_visible_cells({ ...input, sheet: sheetIndex(sheetId) }), revision }
  }
  const { sheetId, row, col } = payload as RegionInput
  if (!workbook.select_current_region) throw new Error('Rust current-region command is unavailable.')
  const sheet = sheetIndex(sheetId)
  return { range: workbook.select_current_region({ sheet, row, col }), revision }
}
