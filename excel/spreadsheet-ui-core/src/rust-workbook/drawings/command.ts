import type { ProjectionRevision, VisibleProjectionRequest, VisibleProjectionResult } from '../../contracts'
import type { WorkerCommand } from '../../rust-worker/types'
import type { SheetDrawing } from '../../drawings/types'
import type { RustWorkbookSheet } from '../commands'
import type { WasmWorkbook } from '../wasm-types'
import { validateProjectionRequest } from '../../projection/contracts'
import { fromRustDrawing, toRustDrawing, type RustSheetDrawing } from './sheet-refs'

export interface WasmDrawingQueries {
  sheet_drawings?: (sheet: number) => string
  set_drawing?: (sheet: number, drawingJson: string) => boolean
  remove_drawing?: (sheet: number, id: string) => boolean
  reorder_drawing?: (sheet: number, id: string, toFront: boolean) => boolean
}

interface DrawingChangeReply {
  readonly changed: boolean
  readonly projection: VisibleProjectionResult
  readonly drawings: readonly SheetDrawing[]
}
export interface RustDrawingCommands {
  'drawings.read': WorkerCommand<{ readonly sheetId: string },
    { readonly drawings: readonly SheetDrawing[]; readonly revision: ProjectionRevision }>
  'drawings.set': WorkerCommand<{
    readonly sheetId: string
    readonly drawing: SheetDrawing
    readonly projection: VisibleProjectionRequest
  }, DrawingChangeReply>
  'drawings.remove': WorkerCommand<{
    readonly sheetId: string
    readonly id: string
    readonly projection: VisibleProjectionRequest
  }, DrawingChangeReply>
  'drawings.reorder': WorkerCommand<{
    readonly sheetId: string
    readonly id: string
    readonly toFront: boolean
    readonly projection: VisibleProjectionRequest
  }, DrawingChangeReply>
}

function sheetIndex(sheets: ReadonlyMap<string, RustWorkbookSheet>, sheetId: string): number {
  const sheet = sheets.get(sheetId)
  if (!sheet || sheet.index < 0) throw new Error('The object worksheet no longer exists.')
  return sheet.index
}

function checkProjection(sheetId: string, projection: VisibleProjectionRequest) {
  if (sheetId !== projection.sheetId || !validateProjectionRequest(projection).ok)
    throw new Error('Invalid object projection request.')
}

/** 目录只经显式读取离开 Rust；形状校验在 Rust，一处为准。 */
export function readDrawings(workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>, sheetId: string): SheetDrawing[] {
  const index = sheetIndex(sheets, sheetId)
  if (!workbook.sheet_drawings) throw new Error('Rust objects are unavailable.')
  return (JSON.parse(workbook.sheet_drawings(index)) as RustSheetDrawing[])
    .map((drawing) => fromRustDrawing(drawing, sheets))
}

export function setDrawing(workbook: WasmWorkbook, sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustDrawingCommands['drawings.set']['payload']): boolean {
  const index = sheetIndex(sheets, input.sheetId)
  checkProjection(input.sheetId, input.projection)
  if (!workbook.set_drawing) throw new Error('Rust objects are unavailable.')
  return workbook.set_drawing(index,
    JSON.stringify(toRustDrawing(input.drawing, input.sheetId, sheets)))
}

export function removeDrawing(workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustDrawingCommands['drawings.remove']['payload']): boolean {
  const index = sheetIndex(sheets, input.sheetId)
  checkProjection(input.sheetId, input.projection)
  if (typeof input.id !== 'string') throw new Error('Invalid object id.')
  if (!workbook.remove_drawing) throw new Error('Rust objects are unavailable.')
  return workbook.remove_drawing(index, input.id)
}

export function reorderDrawing(workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustDrawingCommands['drawings.reorder']['payload']): boolean {
  const index = sheetIndex(sheets, input.sheetId)
  checkProjection(input.sheetId, input.projection)
  if (typeof input.id !== 'string' || typeof input.toFront !== 'boolean')
    throw new Error('Invalid object order request.')
  if (!workbook.reorder_drawing) throw new Error('Rust objects are unavailable.')
  return workbook.reorder_drawing(index, input.id, input.toFront)
}
