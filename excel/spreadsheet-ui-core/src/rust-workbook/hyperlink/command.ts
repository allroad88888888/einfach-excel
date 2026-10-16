import type { ProjectionRevision, VisibleProjectionRequest, VisibleProjectionResult } from '../../backend'
import type { WorkerCommand } from '../../rust-worker/types'
import type { RustWorkbookSheet } from '../commands'
import type { WasmWorkbook } from '../wasm-types'
import { validateProjectionRequest } from '../../projection/contracts'

export interface RustHyperlinkCommands {
  'hyperlink.change': WorkerCommand<{
    readonly sheetId: string
    readonly row: number
    readonly col: number
    readonly url: string | null
    readonly text?: string
    readonly revision: ProjectionRevision
    readonly projection: VisibleProjectionRequest
  }, { readonly changed: boolean; readonly projection: VisibleProjectionResult }>
}

/** Worker 只校验坐标/版本并转发；链接校验、内容、历史都在 Rust。 */
export function changeHyperlink(
  workbook: WasmWorkbook, sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustHyperlinkCommands['hyperlink.change']['payload'], revision: number,
): boolean {
  const sheet = sheets.get(input.sheetId)
  if (input.sheetId !== input.projection.sheetId || !validateProjectionRequest(input.projection).ok)
    throw new Error('Invalid hyperlink projection request.')
  if (input.revision !== revision) throw new Error('The workbook changed. Reopen the hyperlink editor.')
  if (!sheet || ![input.row, input.col].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    input.row >= (sheet.rowCount ?? 1_048_576) || input.col >= (sheet.colCount ?? 16_384))
    throw new Error('The hyperlink cell is outside the worksheet.')
  if (!workbook.change_hyperlink) throw new Error('Rust hyperlink editing is unavailable.')
  return workbook.change_hyperlink(sheet.index, input.row, input.col,
    input.url ?? undefined, input.url === null ? undefined : input.text)
}
