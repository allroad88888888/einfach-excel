import type {
  ProjectionRevision,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '../backend'
import type { WasmWorkbook } from './wasm-types'
import { readWindowProjection } from './window-projection'
import { readFrozenProjection } from './frozen-projection'

/** 一个同步读取过程组合滚动区与冻结区，不增加 Worker 往返或第二个数据版本。 */
export function readVisibleProjection(
  workbook: WasmWorkbook,
  sheetIndex: number,
  request: VisibleProjectionRequest,
  revision: ProjectionRevision,
): VisibleProjectionResult {
  const counts = workbook.frozen_panes?.(sheetIndex)
  const freeze = counts ? { rows: counts[0], cols: counts[1] } : undefined
  const visibility = workbook.sheet_visibility?.(sheetIndex)
  const frozen = freeze && request.viewport
    ? readFrozenProjection(workbook, sheetIndex, request, freeze, visibility)
    : undefined
  return {
    kind: 'visible-window',
    ...(freeze ? { freeze } : {}),
    ...(frozen ? { frozen } : {}),
    ...(visibility ? { visibility } : {}),
    ...(workbook.history_state ? { history: workbook.history_state() } : {}),
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision,
    window: { ...request.window },
    ...readWindowProjection(workbook, sheetIndex, request.window),
  }
}
