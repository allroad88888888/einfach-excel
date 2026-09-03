// 一句话：校验并转发引擎拥有的条件格式配置 RPC。

import type { WorkerCommandHandler } from './worker-command'
import { postError, postResponse } from './worker-post'
import type {
  RemoveConditionalFormatRuleWire,
  SetConditionalFormatRuleWire,
} from './worker-protocol'
import { assertMethod, assertSheet } from './worker-wire-guards'

type ConditionalFormatMutation = SetConditionalFormatRuleWire | RemoveConditionalFormatRuleWire

function invalid(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

function mutationFrom(value: unknown): ConditionalFormatMutation {
  if (!value || typeof value !== 'object') {
    throw invalid('INVALID_CONDITIONAL_FORMAT_REQUEST', 'conditional-format mutation is required')
  }
  const request = value as Partial<ConditionalFormatMutation>
  if (
    typeof request.requestId !== 'number' ||
    !Number.isSafeInteger(request.requestId) ||
    request.requestId < 0
  ) {
    throw invalid(
      'CONDITIONAL_FORMAT_REQUEST_ID_REQUIRED',
      'conditional-format mutations require a non-negative requestId',
    )
  }
  if (
    typeof request.revision !== 'number' ||
    !Number.isSafeInteger(request.revision) ||
    request.revision < 0
  ) {
    throw invalid(
      'CONDITIONAL_FORMAT_REVISION_REQUIRED',
      'conditional-format mutations require a non-negative revision',
    )
  }
  if (request.revision >= Number.MAX_SAFE_INTEGER) {
    throw invalid(
      'CONDITIONAL_FORMAT_REVISION_EXHAUSTED',
      'conditional-format revision cannot advance further',
    )
  }
  return request as ConditionalFormatMutation
}

function conditionalFormatRejection(error: unknown): { code: string; message: string } | null {
  const message = error instanceof Error ? error.message : String(error)
  if (message.startsWith('stale-conditional-format-revision:')) {
    return { code: 'STALE_CONDITIONAL_FORMAT_REVISION', message }
  }
  if (message.includes('conditional-format revision is exhausted')) {
    return { code: 'CONDITIONAL_FORMAT_REVISION_EXHAUSTED', message }
  }
  return null
}

function respondMutation(id: number, run: () => unknown): void {
  try {
    postResponse(id, run())
  } catch (error) {
    const rejection = conditionalFormatRejection(error)
    if (rejection === null) throw error
    postError(id, rejection)
  }
}

/** Conditional-format reads and revision-guarded mutations owned by the engine. */
export const handleConditionalFormatCommand: WorkerCommandHandler = (id, msg, wb) => {
  const sheet = Number(msg.sheet)
  switch (msg.cmd) {
    case 'listConditionalFormats': {
      assertSheet(wb, sheet)
      const listConditionalFormats = assertMethod(wb, 'listConditionalFormats')
      postResponse(id, listConditionalFormats.call(wb, sheet))
      return true
    }
    case 'setConditionalFormatRule': {
      assertSheet(wb, sheet)
      const request = mutationFrom(msg.conditionalFormat)
      const setConditionalFormatRule = assertMethod(wb, 'setConditionalFormatRule')
      respondMutation(id, () => {
        const { requestId: _requestId, ...engineRequest } = request as SetConditionalFormatRuleWire
        return setConditionalFormatRule.call(wb, sheet, engineRequest)
      })
      return true
    }
    case 'removeConditionalFormatRule': {
      assertSheet(wb, sheet)
      const request = mutationFrom(msg.conditionalFormat)
      if (typeof request.ruleId !== 'string' || request.ruleId.length === 0) {
        throw invalid('INVALID_CONDITIONAL_FORMAT_REQUEST', 'conditional-format ruleId is required')
      }
      const removeConditionalFormatRule = assertMethod(wb, 'removeConditionalFormatRule')
      respondMutation(id, () => {
        const { requestId: _requestId, ...engineRequest } =
          request as RemoveConditionalFormatRuleWire
        return removeConditionalFormatRule.call(wb, sheet, engineRequest)
      })
      return true
    }
    default:
      return false
  }
}
