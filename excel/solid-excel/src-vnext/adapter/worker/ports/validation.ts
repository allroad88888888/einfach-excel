// 一句话：数据校验端口。

import type {
  BackendMutationResult,
  ClearValidationRuleRequest,
  SetValidationRuleRequest,
} from '@einfach/spreadsheet-ui-core'
import { cloneRange, normalizeRange } from '@einfach/spreadsheet-ui-core'
import { rangesIntersect } from '../range-overlap'
import { bumpRevision } from '../revision'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import { cloneValidationRule } from '../validation-overlay'
import type { WorkerBackendState } from '../state'

export function createValidationPorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'setValidationRule' | 'clearValidationRule'> {
  return {
    async setValidationRule(request: SetValidationRuleRequest): Promise<BackendMutationResult> {
      const range = normalizeRange(request.range)
      const current = state.validationRulesBySheetId.get(request.sheetId) ?? []
      const next = current
        .filter((rule) => !rangesIntersect(rule.range, range))
        .concat({ range, rule: cloneValidationRule(request.rule), mode: request.mode })
      state.validationRulesBySheetId.set(request.sheetId, next)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? bumpRevision(state),
        affectedRange: cloneRange(range),
      }
    },

    async clearValidationRule(request: ClearValidationRuleRequest): Promise<BackendMutationResult> {
      const range = normalizeRange(request.range)
      const current = state.validationRulesBySheetId.get(request.sheetId) ?? []
      state.validationRulesBySheetId.set(
        request.sheetId,
        current.filter((rule) => !rangesIntersect(rule.range, range)),
      )
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? bumpRevision(state),
        affectedRange: cloneRange(range),
      }
    },
  }
}
