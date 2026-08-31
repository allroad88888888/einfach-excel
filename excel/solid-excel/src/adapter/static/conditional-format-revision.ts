// 一句话：静态后端条件格式配置的按 Sheet 版本门禁。

import type {
  ProjectionRevision,
  RemoveConditionalFormatRuleRequest,
  SetConditionalFormatRuleRequest,
} from '@einfach/spreadsheet-ui-core'
import type { StaticBackendState } from './state'

type ConditionalFormatMutationRequest =
  | SetConditionalFormatRuleRequest
  | RemoveConditionalFormatRuleRequest

type ConditionalFormatRequestError = Error & { code: string }

function requestError(code: string, message: string): ConditionalFormatRequestError {
  return Object.assign(new Error(message), { code })
}

function revisionForSheet(state: StaticBackendState, sheetId: string): number {
  return state.conditionalFormatRevisionBySheetId.get(sheetId) ?? 0
}

export function conditionalFormatRevision(
  state: StaticBackendState,
  sheetId: string,
): ProjectionRevision {
  return revisionForSheet(state, sheetId)
}

/** Reject non-canonical mutation witnesses before state or undo changes. */
export function assertConditionalFormatMutation(
  state: StaticBackendState,
  request: ConditionalFormatMutationRequest,
): void {
  const requestId = request.requestId
  if (typeof requestId !== 'number' || !Number.isSafeInteger(requestId) || requestId < 0) {
    throw requestError(
      'CONDITIONAL_FORMAT_REQUEST_ID_REQUIRED',
      'conditional-format mutations require a non-negative requestId',
    )
  }
  const revision = request.revision
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw requestError(
      'CONDITIONAL_FORMAT_REVISION_REQUIRED',
      'conditional-format mutations require a non-negative revision',
    )
  }
  const actual = revisionForSheet(state, request.sheetId)
  if (revision !== actual) {
    throw requestError(
      'STALE_CONDITIONAL_FORMAT_REVISION',
      `stale conditional-format revision: expected ${actual}, got ${revision}`,
    )
  }
  if (actual >= Number.MAX_SAFE_INTEGER) {
    throw requestError(
      'CONDITIONAL_FORMAT_REVISION_EXHAUSTED',
      'conditional-format revision cannot advance further',
    )
  }
}

/** Advances only after a successful canonical configuration mutation. */
export function advanceConditionalFormatRevision(
  state: StaticBackendState,
  sheetId: string,
): number {
  const current = revisionForSheet(state, sheetId)
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw requestError(
      'CONDITIONAL_FORMAT_REVISION_EXHAUSTED',
      'conditional-format revision cannot advance further',
    )
  }
  const next = current + 1
  state.conditionalFormatRevisionBySheetId.set(sheetId, next)
  return next
}
