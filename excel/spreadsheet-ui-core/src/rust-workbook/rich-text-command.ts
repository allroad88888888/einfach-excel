import type {
  ProjectionRevision,
  RichTextRun,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '../contracts'
import type { WorkerCommand } from '../rust-worker/types'
import type { RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { validateProjectionRequest } from '../projection/contracts'

export interface RustRichTextCommands {
  'richText.change': WorkerCommand<
    {
      readonly sheetId: string
      readonly row: number
      readonly col: number
      readonly runs: readonly RichTextRun[]
      readonly revision: ProjectionRevision
      readonly projection: VisibleProjectionRequest
    },
    { readonly changed: boolean; readonly projection: VisibleProjectionResult }
  >
}

export function changeRichText(
  workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustRichTextCommands['richText.change']['payload'],
  revision: number,
): boolean {
  const sheet = sheets.get(input.sheetId)
  if (input.sheetId !== input.projection.sheetId || !validateProjectionRequest(input.projection).ok)
    throw new Error('Invalid rich text projection request.')
  if (input.revision !== revision)
    throw new Error('The workbook changed. Reopen the rich text editor.')
  if (
    !sheet ||
    sheet.index < 0 ||
    ![input.row, input.col].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    input.row >= (sheet.rowCount ?? 1_048_576) ||
    input.col >= (sheet.colCount ?? 16_384)
  )
    throw new Error('The rich text cell is outside the worksheet.')
  if (!workbook.change_rich_text) throw new Error('Rust rich text editing is unavailable.')
  return workbook.change_rich_text(sheet.index, input.row, input.col, input.runs)
}
