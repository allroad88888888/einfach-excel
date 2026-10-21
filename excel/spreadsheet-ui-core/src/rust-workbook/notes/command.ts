import type { ProjectionRevision, VisibleProjectionRequest, VisibleProjectionResult } from '../../backend'
import type { WorkerCommand } from '../../rust-worker/types'
import type { RustWorkbookSheet } from '../commands'
import type { WasmWorkbook } from '../wasm-types'
import { validateProjectionRequest } from '../../projection/contracts'

interface NoteCell {
  readonly sheetId: string
  readonly row: number
  readonly col: number
  readonly revision: ProjectionRevision
}
export interface WasmNoteQueries {
  read_note?: (sheet: number, row: number, col: number) => string | undefined
  change_note?: (sheet: number, row: number, col: number, text?: string) => boolean
}
export interface RustNoteCommands {
  'notes.read': WorkerCommand<NoteCell, { readonly text: string | null; readonly revision: ProjectionRevision }>
  'notes.change': WorkerCommand<NoteCell & {
    readonly text: string | null
    readonly projection: VisibleProjectionRequest
  }, { readonly changed: boolean; readonly projection: VisibleProjectionResult }>
}

function target(sheets: ReadonlyMap<string, RustWorkbookSheet>, input: NoteCell, revision: number) {
  if (input.revision !== revision) throw new Error('The workbook changed. Reopen the note editor.')
  const sheet = sheets.get(input.sheetId)
  if (!sheet || ![input.row, input.col].every(n => Number.isSafeInteger(n) && n >= 0) ||
    input.row >= (sheet.rowCount ?? 1_048_576) || input.col >= (sheet.colCount ?? 16_384))
    throw new Error('The note cell is outside the worksheet.')
  return sheet.index
}

/** 备注正文只经显式读取离开 Rust，不在 UI Core 缓存工作表备注。 */
export function readNote(workbook: WasmWorkbook, sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustNoteCommands['notes.read']['payload'], revision: number): string | null {
  const index = target(sheets, input, revision)
  if (!workbook.read_note) throw new Error('Rust note editing is unavailable.')
  return workbook.read_note(index, input.row, input.col) ?? null
}

export function changeNote(workbook: WasmWorkbook, sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustNoteCommands['notes.change']['payload'], revision: number): boolean {
  const index = target(sheets, input, revision)
  if (input.sheetId !== input.projection.sheetId || !validateProjectionRequest(input.projection).ok)
    throw new Error('Invalid note projection request.')
  if (input.text !== null && typeof input.text !== 'string') throw new Error('Invalid note text.')
  if (!workbook.change_note) throw new Error('Rust note editing is unavailable.')
  return workbook.change_note(index, input.row, input.col, input.text ?? undefined)
}
