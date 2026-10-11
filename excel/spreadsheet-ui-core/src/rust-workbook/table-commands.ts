import type { ProjectionRevision, VisibleProjectionRequest, VisibleProjectionResult } from '../backend'
import type { WorkerCommand } from '../rust-worker/types'
import type { NativeTableAction, TableChange } from '../tables/native-types'
import { validateProjectionRequest } from '../projection/contracts'
import type { RustWorkbookSheet, RustWorkbookSheetInput } from './commands'
import { writeCellInput } from './cell-io'
import type { WasmWorkbook } from './wasm-types'
import type { CellRange } from '../shared'

export interface RustTableCommands {
  'table.change': WorkerCommand<{
    readonly sheetId: string
    readonly action: TableChange
    readonly revision: ProjectionRevision
    readonly projection: VisibleProjectionRequest
  }, { readonly changed: boolean; readonly projection: VisibleProjectionResult }>
}

/** 坐标映射后只调用一次原生历史命令，不在 Worker 保存 Table 副本。 */
export function changeTable(workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustTableCommands['table.change']['payload'], revision: number,
): boolean {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (input.revision !== revision) throw new Error('The workbook changed. Reopen Tables.')
  const sheet = sheets.get(input.sheetId)
  if (!sheet || sheet.index < 0) throw new Error('The worksheet no longer exists.')
  if (!validateProjectionRequest(input.projection).ok) throw new Error('Invalid table projection request.')
  if (!workbook.change_table || !workbook.listTables ||
    !workbook.read_sparse_range || !workbook.snapshot_format_range)
    throw new Error('Rust table management is unavailable.')
  let action: NativeTableAction
  if (input.action.kind === 'create' || input.action.kind === 'resize') {
    action = { ...input.action, range: tableBounds(sheet, input.action.range) }
  } else if (input.action.kind === 'totals-row') {
    action = { ...input.action, rowCount: sheet.rowCount ?? 1_048_576 }
  } else if (input.action.kind === 'header-row' ||
    input.action.kind === 'rename' || input.action.kind === 'convert-to-range' ||
    input.action.kind === 'total-function' || input.action.kind === 'rename-column' || input.action.kind === 'style') {
    action = input.action
  } else throw new Error('Invalid table action.')
  return workbook.change_table(sheet.index, action)
}

/** 只用于未发布的启动工作簿；导入后建立表头定义，调用者统一清除启动历史。 */
export function importTables(workbook: WasmWorkbook, sheets: ReadonlyMap<string, RustWorkbookSheet>,
  tables: readonly (NonNullable<RustWorkbookSheetInput['tables']>[number] & { sheetId: string })[],
): void {
  for (const table of tables) {
    const sheet = sheets.get(table.sheetId)
    if (!sheet || !workbook.change_table) throw new Error('Rust initial tables are unavailable.')
    workbook.change_table(sheet.index, {
      kind: 'create', name: table.name, range: tableBounds(sheet, table.range),
    })
    if (table.totals) workbook.change_table(sheet.index, {
      kind: 'totals-row', name: table.name, enabled: true, rowCount: sheet.rowCount ?? 1_048_576,
    })
    if (table.style) workbook.change_table(sheet.index, {
      kind: 'style', name: table.name, style: table.style,
    })
    // 复用原生计算列输入，不在 JS 复制公式或建立模板镜像；启动历史随后统一清空。
    table.calculatedColumns?.forEach((formula, column) => {
      if (formula !== null) writeCellInput(workbook, sheet.index,
        table.range.rowStart + 1, table.range.colStart + column, formula)
    })
  }
}

function tableBounds(sheet: RustWorkbookSheet, range: CellRange):
readonly [number, number, number, number] {
  const { rowStart, colStart, rowEnd, colEnd } = range
  if (![rowStart, colStart, rowEnd, colEnd].every(Number.isSafeInteger) ||
    rowStart < 0 || colStart < 0 || rowEnd < rowStart || colEnd < colStart ||
    rowEnd >= (sheet.rowCount ?? 1_048_576) || colEnd >= (sheet.colCount ?? 16_384))
    throw new Error('Choose a table range inside the worksheet.')
  return [rowStart, colStart, rowEnd, colEnd]
}
