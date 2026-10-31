import type { WorkerCommand } from '../rust-worker'
import type { CellRange } from '../shared'

export interface VisibleBlocksResult {
  /** 未被手动、筛选或折叠分组隐藏的不重叠矩形。 */
  readonly blocks: readonly CellRange[]
  readonly cellCount: number
}

export interface RustSelectSpecialCommands {
  readonly 'selection.visibleBlocks': WorkerCommand<
    { readonly sheetId: string; readonly ranges: readonly CellRange[]; readonly limit: number },
    VisibleBlocksResult & { readonly revision: number }
  >
  readonly 'selection.currentRegion': WorkerCommand<
    { readonly sheetId: string; readonly row: number; readonly col: number },
    { readonly range: CellRange; readonly revision: number }
  >
}

/** 选择助手的原生查询；全部只读，不返回工作簿数据。 */
export interface WasmSelectSpecialQueries {
  select_visible_cells?: (request: {
    readonly sheet: number
    readonly ranges: readonly CellRange[]
    readonly limit: number
  }) => VisibleBlocksResult
  select_current_region?: (request: {
    readonly sheet: number
    readonly row: number
    readonly col: number
  }) => CellRange
  prepare_clipboard_blocks?: (
    sheet: number,
    blocks: readonly CellRange[],
  ) => { text: string; rows: number; cols: number; cut: boolean }
}
