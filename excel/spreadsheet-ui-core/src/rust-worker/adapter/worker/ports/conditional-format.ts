// 一句话：将条件格式端口直连到引擎拥有的按 Sheet 配置。

import type {
  BackendMutationResult,
  ConditionalFormatRulesResult,
  ListConditionalFormatRulesRequest,
  RemoveConditionalFormatRuleRequest,
  SetConditionalFormatRuleRequest,
} from '../../../../index'
import { cloneRange } from '../../../../index'
import {
  readConditionalFormatConfig,
  requireConditionalFormatMethods,
  snapshotConditionalFormatConfig,
} from '../conditional-format-client'
import { bumpRevision } from '../revision'
import { resolveSheet } from '../sheet-ops'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

type ConditionalFormatMutationRequest =
  | SetConditionalFormatRuleRequest
  | RemoveConditionalFormatRuleRequest

function assertMutationWitness(request: ConditionalFormatMutationRequest): {
  requestId: number
  revision: number
} {
  if (
    typeof request.requestId !== 'number' ||
    !Number.isSafeInteger(request.requestId) ||
    request.requestId < 0
  ) {
    throw Object.assign(
      new Error('conditional-format mutations require a non-negative requestId'),
      {
        code: 'CONDITIONAL_FORMAT_REQUEST_ID_REQUIRED',
      },
    )
  }
  if (
    typeof request.revision !== 'number' ||
    !Number.isSafeInteger(request.revision) ||
    request.revision < 0
  ) {
    throw Object.assign(new Error('conditional-format mutations require a non-negative revision'), {
      code: 'CONDITIONAL_FORMAT_REVISION_REQUIRED',
    })
  }
  return { requestId: request.requestId, revision: request.revision }
}

function assertAdvancedRevision(snapshotRevision: number, revision: number): void {
  if (revision >= Number.MAX_SAFE_INTEGER || snapshotRevision !== revision + 1) {
    throw Object.assign(
      new Error('worker returned a non-matching conditional-format acknowledgement'),
      {
        code: 'CONDITIONAL_FORMAT_ACK_MISMATCH',
      },
    )
  }
}

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
      const sheet = await resolveSheet(state, request.sheetId)
      const snapshot = await readConditionalFormatConfig(state, sheet.idx)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: snapshot.revision,
        rules: snapshot.rules,
      }
    },

    async setConditionalFormatRule(
      request: SetConditionalFormatRuleRequest,
    ): Promise<BackendMutationResult> {
      const witness = assertMutationWitness(request)
      const sheet = await resolveSheet(state, request.sheetId)
      const snapshot = snapshotConditionalFormatConfig(
        await requireConditionalFormatMethods(state).set(sheet.idx, {
          requestId: witness.requestId,
          revision: witness.revision,
          ruleId: request.ruleId,
          scope: request.scope,
          priority: request.priority,
          rule: request.rule,
        }),
        sheet.idx,
      )
      assertAdvancedRevision(snapshot.revision, witness.revision)
      bumpRevision(state)
      return {
        sheetId: request.sheetId,
        requestId: witness.requestId,
        revision: snapshot.revision,
        affectedRange: cloneRange(request.scope.range),
      }
    },

    async removeConditionalFormatRule(
      request: RemoveConditionalFormatRuleRequest,
    ): Promise<BackendMutationResult> {
      const witness = assertMutationWitness(request)
      const sheet = await resolveSheet(state, request.sheetId)
      const snapshot = snapshotConditionalFormatConfig(
        await requireConditionalFormatMethods(state).remove(sheet.idx, {
          requestId: witness.requestId,
          revision: witness.revision,
          ruleId: request.ruleId,
        }),
        sheet.idx,
      )
      assertAdvancedRevision(snapshot.revision, witness.revision)
      bumpRevision(state)
      return {
        sheetId: request.sheetId,
        requestId: witness.requestId,
        revision: snapshot.revision,
      }
    },
  }
}
