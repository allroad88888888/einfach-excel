// 一句话：条件格式端口。

import type {
  BackendMutationResult,
  ConditionalFormatRuleEntry,
  ConditionalFormatRulesResult,
  ListConditionalFormatRulesRequest,
  RemoveConditionalFormatRuleRequest,
  SetConditionalFormatRuleRequest,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneConditionalFormatRule,
  cloneConditionalFormatRuleEntry,
  cloneRange,
  nextConditionalFormatRuleId,
  normalizeRange,
} from '@einfach/spreadsheet-ui-core'
import { bumpRevision } from '../revision'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createConditionalFormatPorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
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
        rules: (state.conditionalFormatRulesBySheetId.get(request.sheetId) ?? [])
          .map(cloneConditionalFormatRuleEntry)
          .sort((left, right) => left.priority - right.priority),
      }
    },

    async setConditionalFormatRule(
      request: SetConditionalFormatRuleRequest,
    ): Promise<BackendMutationResult> {
      const current = state.conditionalFormatRulesBySheetId.get(request.sheetId) ?? []
      const existingIndex = request.ruleId
        ? current.findIndex((entry) => entry.id === request.ruleId)
        : -1
      const entry: ConditionalFormatRuleEntry = {
        id:
          existingIndex >= 0
            ? current[existingIndex].id
            : (request.ruleId ?? nextConditionalFormatRuleId(current)),
        scope: { range: normalizeRange(request.scope.range) },
        priority:
          request.priority ??
          (existingIndex >= 0 ? current[existingIndex].priority : current.length),
        rule: cloneConditionalFormatRule(request.rule),
      }
      const next =
        existingIndex >= 0
          ? current.map((item, index) => (index === existingIndex ? entry : item))
          : [...current, entry]
      state.conditionalFormatRulesBySheetId.set(
        request.sheetId,
        next.map((item, index) => ({ ...item, priority: item.priority ?? index })),
      )
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? bumpRevision(state),
        affectedRange: cloneRange(entry.scope.range),
      }
    },

    async removeConditionalFormatRule(
      request: RemoveConditionalFormatRuleRequest,
    ): Promise<BackendMutationResult> {
      const current = state.conditionalFormatRulesBySheetId.get(request.sheetId) ?? []
      state.conditionalFormatRulesBySheetId.set(
        request.sheetId,
        current.filter((entry) => entry.id !== request.ruleId),
      )
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? bumpRevision(state),
      }
    },
  }
}
