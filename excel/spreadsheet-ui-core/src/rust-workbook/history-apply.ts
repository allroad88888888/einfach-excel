import type { VisibleProjectionRequest } from '../backend'
import type { RustWorkbookCommands, RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { readSheetMetadata } from './sheet-metadata'
import { readVisibleProjection } from './visible-projection'
import { readSizes } from './size-io'

/** 当前表还在就保持视图；被撤销新增移除时，落到相邻表的 A1。两端共用以校验返回结果。 */
export function historyProjectionRequest(
  request: VisibleProjectionRequest,
  sheets: readonly RustWorkbookSheet[],
  previousIndex: number,
): VisibleProjectionRequest {
  if (sheets.some((sheet) => sheet.id === request.sheetId)) return request
  const next = sheets[Math.min(previousIndex, sheets.length - 1)]
  if (!next?.rowCount || !next.colCount)
    throw new Error('Restored worksheet bounds are unavailable.')
  return {
    ...request,
    sheetId: next.id,
    window: {
      rowStart: 0,
      colStart: 0,
      rowEnd: Math.min(request.window.rowEnd - request.window.rowStart, next.rowCount - 1),
      colEnd: Math.min(request.window.colEnd - request.window.colStart, next.colCount - 1),
    },
  }
}

/** 一次原生撤销返回当前投影；结构恢复额外携带表目录，数据本身不跨线程回放。 */
export function applyRustHistory(
  workbook: WasmWorkbook,
  known: Map<string, RustWorkbookSheet>,
  input: RustWorkbookCommands['history.apply']['payload'],
  revision: number,
): RustWorkbookCommands['history.apply']['result'] {
  const state = workbook.history_state?.()
  const entry = state?.entries[input.direction === 'undo' ? state.undoCount - 1 : state.undoCount]
  if (!entry || !workbook.history_apply)
    throw new Error('No operation is available to undo or redo.')
  const visible = known.get(input.projection.sheetId)
  if (!visible || visible.index < 0) throw new Error('The visible worksheet no longer exists.')
  const affected = [...known.values()].find((sheet) =>
    entry.sheetKey ? sheet.key === entry.sheetKey : sheet.index === entry.sheetIndex,
  )
  if (!affected) throw new Error('History worksheet no longer exists.')
  if (
    entry.sheetChange &&
    (!workbook.sheet_key ||
      [...known.values()].some((sheet) => !sheet.key || !sheet.rowCount || !sheet.colCount))
  )
    throw new Error('Worksheet identity or bounds are unavailable.')
  if (!workbook.history_apply(input.direction))
    throw new Error('No operation is available to undo or redo.')
  const sheets = entry.sheetChange ? readSheetMetadata(workbook, known) : undefined
  const request = sheets
    ? historyProjectionRequest(input.projection, sheets, visible.index)
    : input.projection
  const currentVisible = known.get(request.sheetId)!
  const target = known.get(affected.id)
  // 恢复表时补齐整张画布的稀疏尺寸，避免未进入视口的行高/列宽丢失导致滚动位置漂移。
  const range =
    entry.sheetChange && target && target.index >= 0
      ? { rowStart: 0, colStart: 0, rowEnd: target.rowCount! - 1, colEnd: target.colCount! - 1 }
      : entry.range
  return {
    projection: readVisibleProjection(workbook, currentVisible.index, request, revision),
    sheetId: affected.id,
    ...(target && target.index >= 0 && workbook.sheet_visibility
      ? { visibility: workbook.sheet_visibility(target.index) } : {}),
    range,
    sizes:
      target && target.index >= 0
        ? readSizes(workbook, target.index, range)
        : { rowHeights: [], colWidths: [] },
    ...(sheets ? { sheets } : {}),
  }
}
