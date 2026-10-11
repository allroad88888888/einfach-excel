import type { ProjectionRevision, VisibleProjectionRequest, VisibleProjectionResult } from '../backend'
import type { WorkerCommand } from '../rust-worker/types'
import type { NamedRangeChange, NativeNamedRangeAction } from '../named-ranges/native-types'
import { validateProjectionRequest } from '../projection/contracts'
import type { RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'

export interface RustNamedRangeCommands {
  'namedRange.change': WorkerCommand<{
    readonly sheetId: string
    readonly action: NamedRangeChange
    readonly revision: ProjectionRevision
    readonly projection: VisibleProjectionRequest
  }, { readonly changed: boolean; readonly projection: VisibleProjectionResult }>
}

/** 仅转换当前页面坐标；名称定义、公式改写及历史仍由原生一次完成。 */
export function changeNamedRange(
  workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustNamedRangeCommands['namedRange.change']['payload'],
  revision: number,
): boolean {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (input.revision !== revision) throw new Error('The workbook changed. Reopen the name editor.')
  const visible = sheets.get(input.sheetId)
  if (!visible || visible.index < 0) throw new Error('The worksheet no longer exists.')
  if (!validateProjectionRequest(input.projection).ok)
    throw new Error('Invalid named-range projection request.')
  if (!workbook.change_named_range || !workbook.list_named_ranges ||
    !workbook.read_sparse_range || !workbook.snapshot_format_range)
    throw new Error('Rust named-range management is unavailable.')
  const action = input.action
  let target: NonNullable<Extract<NativeNamedRangeAction, { kind: 'update' }>['target']> | undefined
  if ('target' in action && action.target) {
    const sheet = sheets.get(action.target.sheetId)
    const { rowStart, colStart, rowEnd, colEnd } = action.target.range
    if (!sheet || sheet.index < 0) throw new Error('The named-range worksheet no longer exists.')
    if (![rowStart, colStart, rowEnd, colEnd].every(Number.isSafeInteger) ||
      rowStart < 0 || colStart < 0 || rowEnd < rowStart || colEnd < colStart ||
      rowEnd >= (sheet.rowCount ?? 1_048_576) || colEnd >= (sheet.colCount ?? 16_384))
      throw new Error('Choose a named range inside the worksheet.')
    target = { sheet: sheet.index, range: [rowStart, colStart, rowEnd, colEnd] }
  }
  let native: NativeNamedRangeAction
  switch (action.kind) {
    case 'create':
      if (!target) throw new Error('Choose a range before creating a name.')
      native = { kind: 'create', name: action.name, target }
      break
    case 'update':
      native = { kind: 'update', name: action.name, newName: action.newName, ...(target ? { target } : {}) }
      break
    case 'delete':
      native = { kind: 'delete', name: action.name }
      break
    default:
      throw new Error('Invalid named-range action.')
  }
  return workbook.change_named_range(visible.index, native)
}
