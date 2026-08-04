import { atom } from '@einfach/core'
import { CONDITIONAL_FORMAT_RULES_MAX } from './constants'
import { matchesOwnedEditor, targetIsCurrent } from './mutation-current'
import type { ConditionalFormatMutationReservation, ConditionalFormatMutationTicket } from './mutation-types'
import {
  conditionalFormatEditorStateAtom,
  conditionalFormatMutationLaunchStateAtom,
  conditionalFormatOperationAttemptLedgerStateAtom,
  conditionalFormatRequestSequenceAtom,
  conditionalFormatRulesCacheStateAtom,
} from './state'
import type {
  ConditionalFormatOperationAttemptStatus,
  ConditionalFormatRulesResult,
  ConditionalFormatRulesState,
} from './types'
import { closeEditorState, freezeEditorState, freezeLedger, freezeRulesState, reserveAttemptSlot, settleAttempt } from './value-domain'

export const beginConditionalFormatMutationLaunchAtom = atom(
  null,
  (get, set, reservation: ConditionalFormatMutationReservation): boolean => {
    if (get(conditionalFormatMutationLaunchStateAtom) !== reservation || get(conditionalFormatEditorStateAtom) !== reservation.editor || get(conditionalFormatRulesCacheStateAtom) !== reservation.cache || get(conditionalFormatRequestSequenceAtom) !== reservation.expectedSequence || !targetIsCurrent(get, reservation.ticket, reservation.editor, reservation.cache) || get(conditionalFormatMutationLaunchStateAtom) !== reservation) return false
    const ledger = get(conditionalFormatOperationAttemptLedgerStateAtom)
    if (ledger.some((attempt) => attempt.status === 'outcome-unknown')) {
      set(conditionalFormatEditorStateAtom, freezeEditorState({ ...reservation.editor, error: 'Conditional formatting is blocked by an operation with an unknown outcome' }))
      return false
    }
    const reservedLedger = reserveAttemptSlot(ledger)
    if (reservedLedger === null) {
      set(conditionalFormatEditorStateAtom, freezeEditorState({ ...reservation.editor, error: 'Conditional formatting operation journal is full of unresolved attempts' }))
      return false
    }
    set(conditionalFormatRequestSequenceAtom, reservation.ticket.requestId)
    set(conditionalFormatOperationAttemptLedgerStateAtom, freezeLedger([...reservedLedger, reservation.attempt]))
    set(conditionalFormatEditorStateAtom, freezeEditorState({ ...reservation.editor, requestId: reservation.ticket.requestId, pending: true, error: null }))
    return true
  },
)

const revokeUnlaunchedConditionalFormatMutationAtom = atom(
  null,
  (get, set, reservation: ConditionalFormatMutationReservation): void => {
    const ledger = get(conditionalFormatOperationAttemptLedgerStateAtom)
    const nextLedger = ledger.filter((attempt) => attempt.operationId !== reservation.ticket.operationId || attempt.status !== 'pending')
    if (nextLedger.length !== ledger.length) set(conditionalFormatOperationAttemptLedgerStateAtom, freezeLedger(nextLedger))
    const editor = get(conditionalFormatEditorStateAtom)
    if (matchesOwnedEditor(editor, reservation.ticket)) {
      set(conditionalFormatEditorStateAtom, freezeEditorState({ ...editor, pending: false, error: 'Conditional formatting target changed before transport dispatch' }))
    }
  },
)

export const guardConditionalFormatTransportLaunchAtom = atom(
  null,
  (get, set, reservation: ConditionalFormatMutationReservation): boolean => {
    if (get(conditionalFormatMutationLaunchStateAtom) === reservation && get(conditionalFormatRequestSequenceAtom) === reservation.ticket.requestId && get(conditionalFormatRulesCacheStateAtom) === reservation.cache && targetIsCurrent(get, reservation.ticket) && get(conditionalFormatMutationLaunchStateAtom) === reservation) return true
    set(revokeUnlaunchedConditionalFormatMutationAtom, reservation)
    return false
  },
)

export const releaseConditionalFormatMutationLaunchAtom = atom(
  null,
  (get, set, reservation: ConditionalFormatMutationReservation): void => {
    if (get(conditionalFormatMutationLaunchStateAtom) === reservation) set(conditionalFormatMutationLaunchStateAtom, null)
  },
)

export const settleConditionalFormatAttemptAtom = atom(
  null,
  (get, set, input: { readonly ticket: ConditionalFormatMutationTicket; readonly status: Exclude<ConditionalFormatOperationAttemptStatus, 'pending'>; readonly error?: string; readonly resultRevision?: string | number }): void => {
    set(conditionalFormatOperationAttemptLedgerStateAtom, freezeLedger(settleAttempt(get(conditionalFormatOperationAttemptLedgerStateAtom), input.ticket.operationId, input.status, { error: input.error, resultRevision: input.resultRevision })))
  },
)

export const updateOwnedConditionalFormatEditorAtom = atom(
  null,
  (get, set, input: { readonly ticket: ConditionalFormatMutationTicket; readonly error: string }): void => {
    const editor = get(conditionalFormatEditorStateAtom)
    if (!matchesOwnedEditor(editor, input.ticket) || !targetIsCurrent(get, input.ticket, editor)) return
    set(conditionalFormatEditorStateAtom, freezeEditorState({ ...editor, pending: false, error: input.error }))
  },
)

export const acceptConditionalFormatRulesResultAtom = atom(
  null,
  (get, set, input: { readonly ticket: ConditionalFormatMutationTicket; readonly cache: ConditionalFormatRulesState; readonly result: ConditionalFormatRulesResult }): boolean => {
    if (get(conditionalFormatRulesCacheStateAtom) !== input.cache || !targetIsCurrent(get, input.ticket) || get(conditionalFormatRulesCacheStateAtom) !== input.cache) return false
    set(conditionalFormatRulesCacheStateAtom, freezeRulesState({ sheetId: input.result.sheetId, rules: input.result.rules.length > CONDITIONAL_FORMAT_RULES_MAX ? input.result.rules.slice(-CONDITIONAL_FORMAT_RULES_MAX) : input.result.rules, revision: input.result.revision }))
    return true
  },
)

export const closeOwnedConditionalFormatEditorAtom = atom(
  null,
  (get, set, ticket: ConditionalFormatMutationTicket): void => {
    const editor = get(conditionalFormatEditorStateAtom)
    if (!matchesOwnedEditor(editor, ticket) || !targetIsCurrent(get, ticket)) return
    set(conditionalFormatEditorStateAtom, freezeEditorState(closeEditorState(editor)))
  },
)
