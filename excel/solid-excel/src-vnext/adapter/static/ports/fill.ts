// 一句话：拖拽填充端口。

import { cloneRange } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { applyFillRangePlan, preflightFillRange } from '../fill-range'
import { applyFillSeriesPlan, preflightFillSeries } from '../fill-series'
import { beginUndoableMutation } from '../history-record'
import type { StaticBackendState } from '../state'

export function createFillPorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'fillRange' | 'fillSeries'> {
  return {
    async fillRange(request) {
      const plan = preflightFillRange(state, request)
      if (plan.status === 'noop') {
        return {
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: state.revision,
          applied: false,
          historyTransactionCount: 0,
          historyDisposition: 'none',
        }
      }

      beginUndoableMutation(state)
      applyFillRangePlan(state, request, plan)
      state.revision = plan.nextRevision

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: state.revision,
        affectedRange: cloneRange(plan.writeRange),
        applied: true,
        historyTransactionCount: 1,
        historyDisposition: 'undoable',
      }
    },
    async fillSeries(request) {
      const plan = preflightFillSeries(state, request)
      if (plan.status === 'noop') {
        return {
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: state.revision,
          applied: false,
          historyTransactionCount: 0,
          historyDisposition: 'none',
        }
      }

      applyFillSeriesPlan(state, request.sheetId, plan)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: state.revision,
        affectedRange: cloneRange(plan.writeRange),
        applied: true,
        historyTransactionCount: 1,
        historyDisposition: 'undoable',
      }
    },
  }
}
