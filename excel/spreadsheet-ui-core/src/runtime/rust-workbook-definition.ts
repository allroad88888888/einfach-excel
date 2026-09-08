import type { RustImportCell, RustWorkbookSheetInput } from '../rust-workbook'
import type { WorkerLike } from '../rust-worker'

export interface RustWorkbookSheetDefinition extends RustWorkbookSheetInput {
  readonly id: string
  readonly name: string
  readonly rowCount: number
  readonly colCount: number
}

export interface RustWorkbookDefinition {
  readonly title: string
  readonly sheets: readonly RustWorkbookSheetDefinition[]
  createImportChunks():
    | Iterable<readonly RustImportCell[]>
    | AsyncIterable<readonly RustImportCell[]>
}

export interface StartRustWorkbookRuntimeInput {
  readonly definition: RustWorkbookDefinition
  readonly workerFactory: () => WorkerLike
}

/** Copies a valid Rust workbook definition before asynchronous startup uses it. */
export function snapshotRustWorkbookDefinition(
  input: RustWorkbookDefinition,
): RustWorkbookDefinition {
  const title = input.title.trim()
  const ids = new Set<string>()
  const sheets = input.sheets.map((sheet) => {
    const id = sheet.id.trim()
    const name = sheet.name.trim()
    if (
      id.length === 0 ||
      name.length === 0 ||
      ids.has(id) ||
      !Number.isSafeInteger(sheet.rowCount) ||
      sheet.rowCount < 1 ||
      !Number.isSafeInteger(sheet.colCount) ||
      sheet.colCount < 1
    ) {
      throw new Error('Rust workbook definition contains an invalid sheet.')
    }
    ids.add(id)
    const hidden = (indices: readonly number[] | undefined, count: number) => {
      if (indices?.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= count))
        throw new Error('Invalid initial hidden index.')
      return indices ? Object.freeze([...new Set(indices)].sort((a, b) => a - b)) : undefined
    }
    const hiddenRows = hidden(sheet.hiddenRows, sheet.rowCount)
    const hiddenColumns = hidden(sheet.hiddenColumns, sheet.colCount)
    const mergedRanges = sheet.mergedRanges?.map((range) => {
      if (
        ![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(
          (n) => Number.isSafeInteger(n) && n >= 0,
        ) ||
        range.rowStart > range.rowEnd ||
        range.colStart > range.colEnd ||
        range.rowEnd >= sheet.rowCount ||
        range.colEnd >= sheet.colCount ||
        (range.rowStart === range.rowEnd && range.colStart === range.colEnd)
      )
        throw new Error('Invalid initial merged range.')
      return Object.freeze({ ...range })
    })
    const rowHeights = sheet.rowHeights?.map((entry) => {
      if (
        !Number.isSafeInteger(entry.rowIndex) ||
        entry.rowIndex < 0 ||
        entry.rowIndex >= sheet.rowCount ||
        !Number.isSafeInteger(entry.heightPx) ||
        entry.heightPx < 16 ||
        entry.heightPx > 512
      )
        throw new Error('Invalid initial row height.')
      return Object.freeze({ ...entry })
    })
    const colWidths = sheet.colWidths?.map((entry) => {
      if (
        !Number.isSafeInteger(entry.colIndex) ||
        entry.colIndex < 0 ||
        entry.colIndex >= sheet.colCount ||
        !Number.isSafeInteger(entry.widthPx) ||
        entry.widthPx < 40 ||
        entry.widthPx > 1024
      )
        throw new Error('Invalid initial column width.')
      return Object.freeze({ ...entry })
    })
    return Object.freeze({
      id,
      name,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      ...(rowHeights ? { rowHeights: Object.freeze(rowHeights) } : {}),
      ...(colWidths ? { colWidths: Object.freeze(colWidths) } : {}),
      ...(hiddenRows ? { hiddenRows } : {}),
      ...(hiddenColumns ? { hiddenColumns } : {}),
      ...(mergedRanges ? { mergedRanges: Object.freeze(mergedRanges) } : {}),
    })
  })
  if (title.length === 0 || sheets.length === 0) {
    throw new Error('Rust workbook definition requires a title and at least one sheet.')
  }
  return Object.freeze({
    title,
    sheets: Object.freeze(sheets),
    createImportChunks: input.createImportChunks,
  })
}
