import type { VisibleProjectionRequest, VisibleProjectionResult } from '../backend'
import type { WorkerCommand } from '../rust-worker/types'
import type { RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { readSheetMetadata } from './sheet-metadata'
import { readVisibleProjection } from './visible-projection'

interface SheetManagementResult {
  readonly sheets: readonly RustWorkbookSheet[]
  /** 被操作（或新建）的工作表 ID。 */
  readonly sheetId: string
  readonly revision: number
  readonly projection?: VisibleProjectionResult
}

interface Target {
  readonly sheetId: string
  readonly projection?: VisibleProjectionRequest
}

export interface RustSheetManagementCommands {
  readonly 'workbook.duplicateSheet': WorkerCommand<Target, SheetManagementResult>
  readonly 'workbook.setSheetHidden': WorkerCommand<
    Target & { readonly hidden: boolean },
    SheetManagementResult
  >
  readonly 'workbook.setSheetTabColor': WorkerCommand<
    Target & { readonly color: string | null },
    SheetManagementResult
  >
}

type Known = Map<string, RustWorkbookSheet>

function sheetOf(known: Known, id: string): RustWorkbookSheet {
  const sheet = known.get(id)
  if (!sheet || sheet.index < 0) throw new Error('The worksheet no longer exists.')
  return sheet
}

/** 原生拒绝时抛出的是字符串；统一成 Error，Worker 才能把原因传回界面。 */
function native<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}

function finish(
  workbook: WasmWorkbook,
  known: Known,
  sheetId: string,
  projection: VisibleProjectionRequest | undefined,
  revision: number,
): SheetManagementResult {
  const sheets = readSheetMetadata(workbook, known)
  const visible = projection ? known.get(projection.sheetId) : undefined
  return {
    sheets,
    sheetId,
    revision,
    ...(projection && visible && visible.index >= 0
      ? { projection: readVisibleProjection(workbook, visible.index, projection, revision) }
      : {}),
  }
}

/** 原生创建副本并登记稳定 ID；画布范围沿用源表。 */
export function duplicateWorkbookSheet(
  workbook: WasmWorkbook,
  known: Known,
  input: Target,
  revision: number,
): SheetManagementResult {
  const source = sheetOf(known, input.sheetId)
  if (!workbook.duplicate_sheet || !workbook.sheet_key)
    throw new Error('Rust sheet duplication is unavailable.')
  if (input.projection) sheetOf(known, input.projection.sheetId)
  const index = native(() => workbook.duplicate_sheet!(source.index))
  const id = crypto.randomUUID()
  known.set(id, {
    id,
    index,
    name: workbook.sheet_name(index),
    key: workbook.sheet_key(index),
    rowCount: source.rowCount,
    colCount: source.colCount,
  })
  return finish(workbook, known, id, input.projection, revision + 1)
}

export function setWorkbookSheetHidden(
  workbook: WasmWorkbook,
  known: Known,
  input: Target & { readonly hidden: boolean },
  revision: number,
): SheetManagementResult {
  const sheet = sheetOf(known, input.sheetId)
  if (!workbook.set_sheet_hidden) throw new Error('Rust sheet visibility is unavailable.')
  if (input.projection) sheetOf(known, input.projection.sheetId)
  const changed = native(() => workbook.set_sheet_hidden!(sheet.index, input.hidden))
  return finish(workbook, known, sheet.id, input.projection, changed ? revision + 1 : revision)
}

export function setWorkbookSheetTabColor(
  workbook: WasmWorkbook,
  known: Known,
  input: Target & { readonly color: string | null },
  revision: number,
): SheetManagementResult {
  const sheet = sheetOf(known, input.sheetId)
  if (!workbook.set_sheet_tab_color) throw new Error('Rust sheet tab color is unavailable.')
  if (input.projection) sheetOf(known, input.projection.sheetId)
  const changed = native(() => workbook.set_sheet_tab_color!(sheet.index, input.color ?? undefined))
  return finish(workbook, known, sheet.id, input.projection, changed ? revision + 1 : revision)
}
