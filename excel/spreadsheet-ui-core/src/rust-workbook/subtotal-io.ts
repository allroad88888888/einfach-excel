import type { CellRange } from '../shared'
import type { WorkbookHandler } from './dispatch/context'
import type { RustWorkbookSheet } from './commands'
import type { NativeSubtotalListRequest, NativeSubtotalList } from './subtotal-commands'
import { readSizes } from './size-io'
import { structureSheetAfterEdits, structureProjectionRequest, structureSizeRange } from './structure-geometry'
import { readVisibleProjection } from './visible-projection'

function nativeList(sheet: RustWorkbookSheet, range: CellRange): NativeSubtotalListRequest {
  const { rowCount, colCount } = sheet
  const { rowStart, rowEnd, colStart, colEnd } = range
  if (!rowCount || !colCount || rowEnd >= rowCount || colEnd >= colCount ||
    rowStart > rowEnd || colStart > colEnd ||
    ![rowStart, rowEnd, colStart, colEnd].every(index =>
      Number.isSafeInteger(index) && index >= 0)) {
    throw new Error('Choose a list within the worksheet.')
  }
  return { sheet: sheet.index, rowCount, colCount,
    selection: { startRow: rowStart, endRow: rowEnd, startCol: colStart, endCol: colEnd } }
}

function fromNativeRange(range: NativeSubtotalList['range']): CellRange {
  return { rowStart: range.startRow, rowEnd: range.endRow,
    colStart: range.startCol, colEnd: range.endCol }
}

export const inspectSubtotals: WorkbookHandler<'subtotal.inspect'> = (context, workbook, input) => {
  const sheet = context.sheetsById.get(input.sheetId)
  if (!sheet || sheet.index < 0) throw new Error('The worksheet no longer exists.')
  if (!workbook.inspect_subtotal_list) throw new Error('Rust subtotal inspection is unavailable.')
  const list = workbook.inspect_subtotal_list(nativeList(sheet, input.range))
  return { ...list, range: fromNativeRange(list.range), revision: context.revision }
}

export const changeSubtotals: WorkbookHandler<'subtotal.change'> = (context, workbook, input) => {
  const before = context.sheetsById.get(input.sheetId)
  if (!before || before.index < 0) throw new Error('The worksheet no longer exists.')
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (input.expectedRevision !== context.revision)
    throw new Error('The workbook changed. Read the subtotal list again.')
  if (!workbook.change_subtotals || !workbook.snapshot_viewport_sizes ||
    !workbook.sheet_visibility ||
    !workbook.read_sparse_range || !workbook.snapshot_format_range)
    throw new Error('Rust subtotal command is unavailable.')

  structureProjectionRequest(input.projection, before)
  const result = workbook.change_subtotals({
    list: nativeList(before, input.range), action: input.action,
  })
  if (!result) return { changed: false }
  const sheet = structureSheetAfterEdits(before, result.edits)
  context.revision += 1
  context.sheetsById.set(sheet.id, sheet)
  if (context.clipboard) context.clipboard.invalidated = true
  context.pendingClipboard = undefined
  context.painterToken = undefined
  const range = structureSizeRange(before, sheet)
  const request = structureProjectionRequest(input.projection, sheet)
  return {
    changed: true, edits: result.edits, list: fromNativeRange(result.range), sheet, range,
    sizes: readSizes(workbook, sheet.index, range),
    projection: readVisibleProjection(workbook, sheet.index, request, context.revision),
  }
}
