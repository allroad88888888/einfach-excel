// 一句话：数据校验端口。

import type {
  BackendMutationResult,
  ClearValidationRuleRequest,
  SetValidationRuleRequest,
} from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { beginUndoableMutation } from '../history-record'
import { mutationResult } from '../mutation-result'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'
import { applyValidationRule, clearValidationRule } from '../validation'

export function createValidationPorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'setValidationRule' | 'clearValidationRule'> {
  return {
    async setValidationRule(request: SetValidationRuleRequest): Promise<BackendMutationResult> {
      beginUndoableMutation(state)
      applyValidationRule(state, request)
      state.revision = bumpRevision(state.revision)
      return mutationResult(request, state.revision, request.range)
    },
    async clearValidationRule(request: ClearValidationRuleRequest): Promise<BackendMutationResult> {
      beginUndoableMutation(state)
      clearValidationRule(state, request)
      state.revision = bumpRevision(state.revision)
      return mutationResult(request, state.revision, request.range)
    },
  }
}
