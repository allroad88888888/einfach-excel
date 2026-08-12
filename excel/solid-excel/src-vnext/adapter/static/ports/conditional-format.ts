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
import {
  advanceConditionalFormatRevision,
  assertConditionalFormatMutation,
  conditionalFormatRevision,
} from '../conditional-format-revision'
import { beginUndoableMutation, recordConditionalRulesBefore } from '../history-record'
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
        revision: conditionalFormatRevision(state, request.sheetId),
        rules: listConditionalFormatRulesForSheet(state, request.sheetId),
      }
    },
    async setConditionalFormatRule(
      request: SetConditionalFormatRuleRequest,
    ): Promise<BackendMutationResult> {
      assertConditionalFormatMutation(state, request)
      beginUndoableMutation(state)
      recordConditionalRulesBefore(state, request.sheetId)
      const entry = setConditionalFormatRuleInState(state, request)
      state.revision = bumpRevision(state.revision)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: advanceConditionalFormatRevision(state, request.sheetId),
        affectedRange: entry.scope.range,
      }
    },
    async removeConditionalFormatRule(
      request: RemoveConditionalFormatRuleRequest,
    ): Promise<BackendMutationResult> {
      assertConditionalFormatMutation(state, request)
      beginUndoableMutation(state)
      recordConditionalRulesBefore(state, request.sheetId)
      removeConditionalFormatRuleFromState(state, request)
      state.revision = bumpRevision(state.revision)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: advanceConditionalFormatRevision(state, request.sheetId),
      }
    },
  }
}
