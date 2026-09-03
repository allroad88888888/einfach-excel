import type { RustImportCell } from '../rust-workbook'
import type { WorkerLike } from '../rust-worker'

export interface RustWorkbookSheetDefinition {
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
    return Object.freeze({
      id,
      name,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
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
