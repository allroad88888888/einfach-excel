import type { WorkerCommand } from '../rust-worker/types'
import type {
  VisibleProjectionRequest,
  VisibleProjectionResult,
  ProjectionRevision,
} from '../backend'
import type { NativeOutlineAction } from '../outline/native-state'
import type { RustWorkbookSheet, RustWorkbookSheetInput } from './commands'
import type { WasmWorkbook } from './wasm-types'

export interface RustOutlineCommands {
  'outline.change': WorkerCommand<
    {
      readonly sheetId: string
      readonly axis: 'row' | 'column'
      readonly action: NativeOutlineAction
      readonly revision: ProjectionRevision
      readonly projection: VisibleProjectionRequest
    },
    { readonly changed: boolean; readonly projection: VisibleProjectionResult }
  >
}

/** 版本门禁保护按序号定位的组；传输层只检查画布，不计算分组或隐藏集合。 */
export function changeOutline(
  workbook: WasmWorkbook,
  sheet: RustWorkbookSheet,
  input: RustOutlineCommands['outline.change']['payload'],
  revision: number,
) {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (input.revision !== revision)
    throw new Error('The worksheet changed. Try the outline action again.')
  if (input.axis !== 'row' && input.axis !== 'column') throw new Error('Invalid outline axis.')
  const action = input.action
  if (action.kind === 'group' || action.kind === 'ungroup') {
    const count = input.axis === 'row' ? (sheet.rowCount ?? 1_048_576) : (sheet.colCount ?? 16_384)
    if (
      ![action.start, action.end].every(Number.isSafeInteger) ||
      action.start < 0 ||
      action.start > action.end ||
      action.end >= count
    )
      throw new Error('Outline range is outside the worksheet.')
  }
  if (
    !workbook.change_outline ||
    !workbook.sheet_visibility ||
    !workbook.read_sparse_range ||
    !workbook.snapshot_format_range
  )
    throw new Error('Rust outline command is unavailable.')
  return workbook.change_outline(sheet.index, input.axis, action)
}

/** 种子也走原生入口，初始化末尾统一清空历史。 */
export function importSheetOutline(
  workbook: WasmWorkbook,
  index: number,
  input: RustWorkbookSheetInput,
) {
  for (const [axis, groups] of [
    ['row', input.outline?.rows],
    ['column', input.outline?.columns],
  ] as const) {
    if (!groups?.length) continue
    const ordered = [...groups].sort((a, b) => a.start - b.start || b.end - a.end)
    if (!workbook.change_outline) throw new Error('Rust outline command is unavailable.')
    for (const group of ordered)
      workbook.change_outline(index, axis, { kind: 'group', start: group.start, end: group.end })
    ordered.forEach((group, at) => {
      if (group.collapsed)
        workbook.change_outline!(index, axis, { kind: 'set-collapsed', index: at, collapsed: true })
    })
  }
}
