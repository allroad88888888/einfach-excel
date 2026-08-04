import type {
  AcknowledgementSnapshot,
  ConditionalFormatMutationTicket,
  RulesResultSnapshot,
} from './mutation-types'
import { isObjectRecord, snapshotRevision } from './snapshot-format'
import { snapshotEntry } from './snapshot-rules'
import type {
  ConditionalFormatRuleEntry,
  RemoveConditionalFormatRuleRequest,
  SetConditionalFormatRuleRequest,
} from './types'
import { copyRule, copyScope, freezeEntry } from './value-domain'

export function snapshotAcknowledgement(value: unknown, ticket: ConditionalFormatMutationTicket): AcknowledgementSnapshot {
  if (!isObjectRecord(value)) return { acknowledgement: null, error: 'Conditional formatting acknowledgement must be an object' }
  try {
    const revision = snapshotRevision(value.revision)
    if (typeof value.sheetId !== 'string' || value.sheetId !== ticket.sheetId) return { acknowledgement: null, error: 'Conditional formatting acknowledgement targeted a different sheet' }
    if (typeof value.requestId !== 'number' || !Number.isSafeInteger(value.requestId) || value.requestId !== ticket.requestId) return { acknowledgement: null, error: 'Conditional formatting acknowledgement returned a different request id' }
    if (!revision.ok) return { acknowledgement: null, error: 'Conditional formatting acknowledgement returned an invalid revision' }
    return { acknowledgement: Object.freeze({ sheetId: value.sheetId, requestId: value.requestId, ...(revision.value === undefined ? {} : { revision: revision.value }) }), error: null }
  } catch {
    return { acknowledgement: null, error: 'Conditional formatting acknowledgement could not be read safely' }
  }
}

export function snapshotRulesResult(value: unknown, ticket: ConditionalFormatMutationTicket): RulesResultSnapshot {
  if (!isObjectRecord(value)) return { result: null, error: 'Conditional formatting rules response must be an object' }
  try {
    const revision = snapshotRevision(value.revision)
    if (typeof value.sheetId !== 'string' || value.sheetId !== ticket.sheetId) return { result: null, error: 'Conditional formatting rules response targeted a different sheet' }
    if (typeof value.requestId !== 'number' || !Number.isSafeInteger(value.requestId) || value.requestId !== ticket.requestId) return { result: null, error: 'Conditional formatting rules response returned a different request id' }
    if (!revision.ok) return { result: null, error: 'Conditional formatting rules response returned an invalid revision' }
    if (!Array.isArray(value.rules)) return { result: null, error: 'Conditional formatting rules response returned invalid rules' }
    const rules: ConditionalFormatRuleEntry[] = []
    for (const ruleValue of [...value.rules]) {
      const rule = snapshotEntry(ruleValue)
      if (rule === null) return { result: null, error: 'Conditional formatting rules response returned invalid rules' }
      rules.push(freezeEntry(rule))
    }
    return { result: Object.freeze({ sheetId: value.sheetId, requestId: value.requestId, rules: Object.freeze(rules), ...(revision.value === undefined ? {} : { revision: revision.value }) }), error: null }
  } catch {
    return { result: null, error: 'Conditional formatting rules response could not be read safely' }
  }
}

export function copyMutationRequest(
  request: SetConditionalFormatRuleRequest | RemoveConditionalFormatRuleRequest,
): SetConditionalFormatRuleRequest | RemoveConditionalFormatRuleRequest {
  return request.kind === 'remove-conditional-format-rule' ? { ...request } : { ...request, scope: copyScope(request.scope), rule: copyRule(request.rule) }
}
