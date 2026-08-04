import { atom, type Getter, type Setter } from '@einfach/core'
import type {
  ConditionalFormatMutationCapture,
  ConditionalFormatMutationReservation,
} from './mutation-types'
import { snapshotMutationInput } from './mutation-input'
import {
  conditionalFormatEditorStateAtom,
  conditionalFormatMutationLaunchStateAtom,
  conditionalFormatOperationAttemptLedgerStateAtom,
  conditionalFormatRequestSequenceAtom,
  conditionalFormatRulesCacheStateAtom,
} from './state'
import { resolveScopeTarget, resolveSheetTarget, resolvedTargetAuthorityIsCurrent } from './target-domain'
import type {
  RemoveConditionalFormatRuleRequest,
  RunConditionalFormatMutationInput,
  SetConditionalFormatRuleRequest,
} from './types'
import {
  defaultRuleForKind,
  freezeAttempt,
  freezeEditorState,
  freezeRule,
  freezeScope,
  nextConditionalFormatRequestId,
  reserveAttemptSlot,
} from './value-domain'

function releaseCapture(get: Getter, set: Setter, capture: ConditionalFormatMutationCapture, error: string | null): null {
  if (get(conditionalFormatMutationLaunchStateAtom) !== capture) return null
  const editor = get(conditionalFormatEditorStateAtom)
  if (error !== null && editor === capture.editor) set(conditionalFormatEditorStateAtom, freezeEditorState({ ...editor, error }))
  if (get(conditionalFormatMutationLaunchStateAtom) === capture) set(conditionalFormatMutationLaunchStateAtom, null)
  return null
}

export const reserveConditionalFormatMutationLaunchAtom = atom(
  null,
  (get, set, input: RunConditionalFormatMutationInput): ConditionalFormatMutationReservation | null => {
    const editor = get(conditionalFormatEditorStateAtom)
    if (!editor.open || editor.pending || get(conditionalFormatMutationLaunchStateAtom) !== null) return null
    const capture: ConditionalFormatMutationCapture = Object.freeze({ kind: 'capture', editor })
    set(conditionalFormatMutationLaunchStateAtom, capture)
    const ledgerBeforeInput = get(conditionalFormatOperationAttemptLedgerStateAtom)
    if (ledgerBeforeInput.some((attempt) => attempt.status === 'outcome-unknown')) return releaseCapture(get, set, capture, 'Conditional formatting is blocked by an operation with an unknown outcome')
    if (reserveAttemptSlot(ledgerBeforeInput) === null) return releaseCapture(get, set, capture, 'Conditional formatting operation journal is full of unresolved attempts')
    const inputSnapshot = snapshotMutationInput(input)
    if (get(conditionalFormatMutationLaunchStateAtom) !== capture || get(conditionalFormatEditorStateAtom) !== editor) return releaseCapture(get, set, capture, null)
    if (inputSnapshot === null) return releaseCapture(get, set, capture, 'Conditional formatting mutation input is invalid')
    const execute = inputSnapshot.action === 'save' ? inputSnapshot.setRule : inputSnapshot.removeRule
    if (execute === undefined) return releaseCapture(get, set, capture, `Conditional formatting ${inputSnapshot.action} is unavailable`)
    const ruleId = editor.ruleId && editor.ruleId.length > 0 ? editor.ruleId : null
    if (inputSnapshot.action === 'remove' && ruleId === null) return releaseCapture(get, set, capture, 'Conditional formatting remove requires a rule id')
    const cache = get(conditionalFormatRulesCacheStateAtom)
    const sheetTarget = resolveSheetTarget(get, inputSnapshot.sheetId, cache)
    if (get(conditionalFormatMutationLaunchStateAtom) !== capture || get(conditionalFormatEditorStateAtom) !== editor || get(conditionalFormatRulesCacheStateAtom) !== cache) return releaseCapture(get, set, capture, null)
    if (sheetTarget === null || sheetTarget.sheetId.length === 0) return releaseCapture(get, set, capture, 'Conditional formatting requires an active sheet')
    const scopeTarget = resolveScopeTarget(get, inputSnapshot.scope, editor)
    if (get(conditionalFormatMutationLaunchStateAtom) !== capture || get(conditionalFormatEditorStateAtom) !== editor || get(conditionalFormatRulesCacheStateAtom) !== cache || (scopeTarget !== null && !resolvedTargetAuthorityIsCurrent(get, sheetTarget, scopeTarget))) return releaseCapture(get, set, capture, null)
    if (scopeTarget === null) return releaseCapture(get, set, capture, 'Conditional formatting requires a valid target range')
    const expectedSequence = get(conditionalFormatRequestSequenceAtom)
    const requestId = nextConditionalFormatRequestId(expectedSequence)
    if (requestId === null) return releaseCapture(get, set, capture, 'Conditional formatting request ticket space is exhausted')
    const targetScope = freezeScope(scopeTarget.scope)
    const baseRevision = cache.sheetId === sheetTarget.sheetId ? cache.revision : undefined
    const selectedRule = editor.draft?.rule.kind === editor.selectedKind ? freezeRule(editor.draft.rule) : freezeRule(defaultRuleForKind(editor.selectedKind))
    const operationId = `conditional-format-${requestId}`
    const ticket = Object.freeze({ sessionId: editor.sessionId, requestId, sheetId: sheetTarget.sheetId, sheetTargetSource: sheetTarget.source, workspaceAuthorityWitness: sheetTarget.authorityWitness, scope: targetScope, scopeTargetSource: scopeTarget.source, selectionAuthorityWitness: scopeTarget.authorityWitness, ruleId, selectedKind: editor.selectedKind, operationId })
    const request: SetConditionalFormatRuleRequest | RemoveConditionalFormatRuleRequest = inputSnapshot.action === 'save'
      ? Object.freeze({ kind: 'set-conditional-format-rule', sheetId: ticket.sheetId, ...(ruleId === null ? {} : { ruleId }), scope: targetScope, ...(editor.draft?.priority === undefined ? {} : { priority: editor.draft.priority }), rule: selectedRule, requestId, ...(baseRevision === undefined ? {} : { revision: baseRevision }) })
      : Object.freeze({ kind: 'remove-conditional-format-rule', sheetId: ticket.sheetId, ruleId: ruleId!, requestId, ...(baseRevision === undefined ? {} : { revision: baseRevision }) })
    const attempt = freezeAttempt({ operationId, requestId, sessionId: editor.sessionId, action: inputSnapshot.action, sheetId: ticket.sheetId, ruleId, scope: inputSnapshot.action === 'save' ? targetScope : null, baseRevision: baseRevision ?? null, status: 'pending' })
    const reservation: ConditionalFormatMutationReservation = Object.freeze({ kind: 'reservation', editor, cache, expectedSequence, ticket, input: inputSnapshot, request, attempt })
    if (get(conditionalFormatMutationLaunchStateAtom) !== capture || get(conditionalFormatEditorStateAtom) !== editor || get(conditionalFormatRulesCacheStateAtom) !== cache || get(conditionalFormatRequestSequenceAtom) !== expectedSequence || get(conditionalFormatOperationAttemptLedgerStateAtom) !== ledgerBeforeInput || !resolvedTargetAuthorityIsCurrent(get, sheetTarget, scopeTarget)) return releaseCapture(get, set, capture, null)
    set(conditionalFormatMutationLaunchStateAtom, reservation)
    return reservation
  },
)
