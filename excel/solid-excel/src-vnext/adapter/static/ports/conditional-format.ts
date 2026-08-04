// 一句话：条件格式端口。

import type {
  BackendMutationResult,
  ConditionalFormatRulesResult,
  ListConditionalFormatRulesRequest,
  RemoveConditionalFormatRuleRequest,
  SetConditionalFormatRuleRequest,
} from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import {
  listConditionalFormatRulesForSheet,
  removeConditionalFormatRuleFromState,
  setConditionalFormatRuleInState,
} from '../conditional-format'
import { beginUndoableMutation, recordConditionalRulesBefore } from '../history-record'
import { mutationResult } from '../mutation-result'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'

export function createConditionalFormatPorts(
  state: StaticBackendState,
): Pick<
  StaticSpreadsheetBackend,
  'listConditionalFormatRules' | 'setConditionalFormatRule' | 'removeConditionalFormatRule'
> {
  return {
    async listConditionalFormatRules(
      request: ListConditionalFormatRulesRequest,
    ): Promise<ConditionalFormatRulesResult> {
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        rules: listConditionalFormatRulesForSheet(state, request.sheetId),
      }
    },
    async setConditionalFormatRule(
      request: SetConditionalFormatRuleRequest,
    ): Promise<BackendMutationResult> {
      beginUndoableMutation(state)
      recordConditionalRulesBefore(state, request.sheetId)
      setConditionalFormatRuleInState(state, request)
      state.revision = bumpRevision(state.revision)
      return mutationResult(request, state.revision, request.scope.range)
    },
    async removeConditionalFormatRule(
      request: RemoveConditionalFormatRuleRequest,
    ): Promise<BackendMutationResult> {
      beginUndoableMutation(state)
      recordConditionalRulesBefore(state, request.sheetId)
      removeConditionalFormatRuleFromState(state, request)
      state.revision = bumpRevision(state.revision)
      return mutationResult(request, state.revision)
    },
  }
}
