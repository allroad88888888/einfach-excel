import {
  CONSOLIDATE_FUNCTIONS,
  type ConsolidateApplyRequest,
  type ConsolidateFunction,
  type ConsolidateRequest,
  type ConsolidateSourceRef,
} from './consolidate-commands'
import type { RustWorkbookSheet } from './commands'
import type { CellRange } from '../shared'
import type { WasmWorkbook } from './wasm-types'

type Sheets = ReadonlyMap<string, RustWorkbookSheet>

const VALID_FUNCTIONS = new Set<string>(CONSOLIDATE_FUNCTIONS)

function readSheet(sheets: Sheets, sheetId: string): RustWorkbookSheet {
  const sheet = sheets.get(sheetId)
  if (!sheet || sheet.index < 0) throw new Error('The worksheet no longer exists.')
  return sheet
}

function isValidRange(range: CellRange, rowCount: number, colCount: number): boolean {
  return (
    Number.isSafeInteger(range.rowStart) &&
    Number.isSafeInteger(range.rowEnd) &&
    Number.isSafeInteger(range.colStart) &&
    Number.isSafeInteger(range.colEnd) &&
    range.rowStart >= 0 &&
    range.colStart >= 0 &&
    range.rowStart <= range.rowEnd &&
    range.colStart <= range.colEnd &&
    range.rowEnd < rowCount &&
    range.colEnd < colCount
  )
}

function readSource(sheets: Sheets, source: ConsolidateSourceRef) {
  const sheet = readSheet(sheets, source.sheetId)
  const rowCount = sheet.rowCount ?? 1_048_576
  const colCount = sheet.colCount ?? 16_384
  if (!isValidRange(source.range, rowCount, colCount)) {
    throw new Error('Choose valid source ranges within each worksheet.')
  }
  return { sheet: sheet.index, range: source.range }
}

function nativeConsolidateRequest(sheets: Sheets, input: ConsolidateRequest) {
  if (!VALID_FUNCTIONS.has(input.function)) {
    throw new Error('Choose a valid consolidation function.')
  }
  if (!Array.isArray(input.sources) || input.sources.length === 0 || input.sources.length > 32) {
    throw new Error('Add between 1 and 32 source ranges to consolidate.')
  }
  if (
    typeof input.topRow !== 'boolean' ||
    typeof input.leftColumn !== 'boolean' ||
    typeof input.createLinks !== 'boolean'
  ) {
    throw new Error('Choose valid consolidation options.')
  }
  const sheet = readSheet(sheets, input.sheetId)
  const rowCount = sheet.rowCount ?? 1_048_576
  const colCount = sheet.colCount ?? 16_384
  const { row, col } = input.destination
  if (
    !Number.isSafeInteger(row) ||
    row < 0 ||
    row >= rowCount ||
    !Number.isSafeInteger(col) ||
    col < 0 ||
    col >= colCount
  ) {
    throw new Error('Choose a destination cell within the worksheet.')
  }
  return {
    function: input.function as ConsolidateFunction,
    sources: input.sources.map((source) => readSource(sheets, source)),
    sheet: sheet.index,
    destination: input.destination,
    topRow: input.topRow,
    leftColumn: input.leftColumn,
    createLinks: input.createLinks,
    rowCount,
    colCount,
  }
}

export function previewConsolidate(
  workbook: WasmWorkbook,
  sheets: Sheets,
  input: ConsolidateRequest,
  revision: number,
) {
  if (!workbook.preview_consolidate) {
    throw new Error('Rust consolidate preview is unavailable.')
  }
  return { ...workbook.preview_consolidate(nativeConsolidateRequest(sheets, input)), revision }
}

export function applyConsolidate(
  workbook: WasmWorkbook,
  sheets: Sheets,
  input: ConsolidateApplyRequest,
  revision: number,
) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== revision) {
    throw new Error('The workbook changed. Preview the consolidated output again.')
  }
  readSheet(sheets, input.projection.sheetId)
  if (
    !workbook.apply_consolidate ||
    !workbook.read_sparse_range ||
    !workbook.snapshot_format_range
  ) {
    throw new Error('Rust consolidate or projection is unavailable.')
  }
  return workbook.apply_consolidate(nativeConsolidateRequest(sheets, input), input.approval)
}
