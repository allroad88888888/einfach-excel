import type { RustWorkbookCommands, RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'
import {
  structureProjectionRequest,
  structureSheet,
  structureSizeRange,
} from './structure-geometry'
import { readSizes } from './size-io'
import { readVisibleProjection } from './visible-projection'

/** 原生插删及历史只调用一次；确认后发布画布元数据与同修订版投影。 */
export function changeStructure(
  workbook: WasmWorkbook,
  known: Map<string, RustWorkbookSheet>,
  input: RustWorkbookCommands['sheet.editStructure']['payload'],
  revision: number,
): RustWorkbookCommands['sheet.editStructure']['result'] {
  const before = known.get(input.sheetId)
  if (!before || before.index < 0) throw new Error('The worksheet no longer exists.')
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (
    !workbook.edit_structure ||
    !workbook.snapshot_viewport_sizes ||
    !workbook.sheet_visibility ||
    !workbook.read_sparse_range ||
    !workbook.snapshot_format_range
  )
    throw new Error('Rust structure command is unavailable.')
  const sheet = structureSheet(before, input.edit)
  const request = structureProjectionRequest(input.projection, sheet)
  const range = structureSizeRange(before, sheet)
  if (!workbook.edit_structure(before.index, input.edit.action, input.edit.at, input.edit.count))
    throw new Error('Rust did not apply the structural edit.')
  known.set(sheet.id, sheet)
  return {
    sheet,
    range,
    sizes: readSizes(workbook, sheet.index, range),
    projection: readVisibleProjection(workbook, sheet.index, request, revision),
  }
}
