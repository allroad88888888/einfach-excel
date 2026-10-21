import type { ProjectionRevision, VisibleProjectionRequest, VisibleProjectionResult } from '../../backend'
import type { WorkerCommand } from '../../rust-worker/types'
import type { RustWorkbookSheet } from '../commands'
import type { WasmWorkbook } from '../wasm-types'
import { validateProjectionRequest } from '../../projection/contracts'
import { isNativeCommentThread, type NativeCommentChange, type NativeCommentThread } from '../../comments/native/types'

interface CommentCell {
  readonly sheetId: string
  readonly row: number
  readonly col: number
  readonly revision: ProjectionRevision
}
export interface WasmCommentQueries {
  read_comment?: (sheet: number, row: number, col: number) => string
  change_comment?: (sheet: number, row: number, col: number, changeJson: string) => boolean
}
export interface RustCommentCommands {
  'comments.read': WorkerCommand<
    CommentCell,
    { readonly thread: NativeCommentThread | null; readonly revision: ProjectionRevision }
  >
  'comments.change': WorkerCommand<
    CommentCell & {
      readonly change: NativeCommentChange
      readonly projection: VisibleProjectionRequest
    },
    {
      readonly changed: boolean
      readonly thread: NativeCommentThread
      readonly projection: VisibleProjectionResult
    }
  >
}

function target(
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: CommentCell,
  revision: number,
) {
  if (input.revision !== revision)
    throw new Error('The workbook changed. Reopen the comment editor.')
  const sheet = sheets.get(input.sheetId)
  if (
    !sheet ||
    ![input.row, input.col].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    input.row >= (sheet.rowCount ?? 1_048_576) ||
    input.col >= (sheet.colCount ?? 16_384)
  )
    throw new Error('The comment cell is outside the worksheet.')
  return sheet.index
}

export function readComment(
  workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustCommentCommands['comments.read']['payload'],
  revision: number,
): NativeCommentThread | null {
  const index = target(sheets, input, revision)
  if (!workbook.read_comment) throw new Error('Rust comment editing is unavailable.')
  const thread: unknown = JSON.parse(workbook.read_comment(index, input.row, input.col))
  if (thread !== null && !isNativeCommentThread(thread))
    throw new Error('Rust returned an invalid comment thread.')
  return thread
}

export function changeComment(
  workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustCommentCommands['comments.change']['payload'],
  revision: number,
): boolean {
  const index = target(sheets, input, revision)
  if (input.sheetId !== input.projection.sheetId || !validateProjectionRequest(input.projection).ok)
    throw new Error('Invalid comment projection request.')
  if (!workbook.change_comment) throw new Error('Rust comment editing is unavailable.')
  return workbook.change_comment(index, input.row, input.col, JSON.stringify(input.change))
}
