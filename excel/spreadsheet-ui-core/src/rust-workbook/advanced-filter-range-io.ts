import type {
  AdvancedFilterCopyApply, AdvancedFilterCopyRequest, AdvancedFilterRangeCriteria,
  AdvancedFilterRangeReference, NativeFilterRangeCriteria, NativeFilterRangeReference,
} from './advanced-filter-range-commands'
import type { RustWorkbookSheet } from './commands'
import { validFilterRange } from './filter-commands'
import type { WasmWorkbook } from './wasm-types'

type Sheets = ReadonlyMap<string, RustWorkbookSheet>

function readSheet(sheets: Sheets, sheetId: string): RustWorkbookSheet {
  const sheet = sheets.get(sheetId)
  if (!sheet || sheet.index < 0) throw new Error('The worksheet no longer exists.')
  return sheet
}

function readRange(
  sheets: Sheets, reference: AdvancedFilterRangeReference,
): NativeFilterRangeReference {
  const sheet = readSheet(sheets, reference.sheetId)
  const { range } = reference
  if (!validFilterRange(range) || range.rowEnd >= (sheet.rowCount ?? 1_048_576) ||
    range.colEnd >= (sheet.colCount ?? 16_384)) {
    throw new Error('Choose a worksheet range with a header and data rows.')
  }
  return { sheet: sheet.index, range }
}

export function nativeAdvancedFilterCriteria(
  sheets: Sheets, input: AdvancedFilterRangeCriteria,
): NativeFilterRangeCriteria {
  if (typeof input.uniqueOnly !== 'boolean') throw new Error('Choose valid advanced filter options.')
  return {
    uniqueOnly: input.uniqueOnly,
    ...(input.criteria === undefined ? {} : { criteria: readRange(sheets, input.criteria) }),
  }
}

function nativeCopyRequest(sheets: Sheets, input: AdvancedFilterCopyRequest) {
  const sheet = readSheet(sheets, input.sheetId)
  const rowCount = sheet.rowCount ?? 1_048_576
  const colCount = sheet.colCount ?? 16_384
  const { row, col } = input.destination
  if (!Number.isSafeInteger(row) || row < 0 || row >= rowCount ||
    !Number.isSafeInteger(col) || col < 0 || col >= colCount) {
    throw new Error('Choose a destination inside the worksheet.')
  }
  const source = readRange(sheets, input.source)
  if (input.outputFields !== undefined && (!Array.isArray(input.outputFields) ||
    input.outputFields.length > source.range.colEnd - source.range.colStart + 1 ||
    input.outputFields.some((field) => typeof field !== 'string' || !field.trim() || field.length > 32767))) {
    throw new Error('Choose distinct output headings from the source.')
  }
  return {
    ...nativeAdvancedFilterCriteria(sheets, input), source, sheet: sheet.index,
    destination: input.destination, rowCount, colCount,
    ...(input.outputFields === undefined ? {} : { outputFields: input.outputFields }),
  }
}

export function previewAdvancedFilterCopy(
  workbook: WasmWorkbook, sheets: Sheets, input: AdvancedFilterCopyRequest, revision: number,
) {
  if (!workbook.preview_advanced_filter_copy) throw new Error('Rust advanced filter preview is unavailable.')
  return { ...workbook.preview_advanced_filter_copy(nativeCopyRequest(sheets, input)), revision }
}

export function applyAdvancedFilterCopy(
  workbook: WasmWorkbook, sheets: Sheets, input: AdvancedFilterCopyApply, revision: number,
) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== revision) {
    throw new Error('The workbook changed. Preview the filtered output again.')
  }
  readSheet(sheets, input.projection.sheetId)
  if (!workbook.copy_advanced_filter || !workbook.read_sparse_range ||
    !workbook.snapshot_format_range) {
    throw new Error('Rust advanced filter copy or projection is unavailable.')
  }
  return workbook.copy_advanced_filter(nativeCopyRequest(sheets, input), input.approval)
}
