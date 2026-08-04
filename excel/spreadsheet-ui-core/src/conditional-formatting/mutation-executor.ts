import type { Setter } from '@einfach/core'
import { copyMutationRequest, snapshotAcknowledgement, snapshotRulesResult } from './acknowledgement'
import { conditionalFormatCurrentTargetAtom } from './mutation-current'
import type { ConditionalFormatMutationReservation } from './mutation-types'
import {
  acceptConditionalFormatRulesResultAtom,
  beginConditionalFormatMutationLaunchAtom,
  closeOwnedConditionalFormatEditorAtom,
  guardConditionalFormatTransportLaunchAtom,
  releaseConditionalFormatMutationLaunchAtom,
  settleConditionalFormatAttemptAtom,
  updateOwnedConditionalFormatEditorAtom,
} from './mutation-settlement'
import { reserveConditionalFormatMutationLaunchAtom } from './mutation-reservation'
import type { RunConditionalFormatMutationInput } from './types'
import { errorMessage } from './snapshot-format'
import { atom } from '@einfach/core'

async function executeReservedConditionalFormatMutation(set: Setter, reservation: ConditionalFormatMutationReservation): Promise<void> {
  const started = set(beginConditionalFormatMutationLaunchAtom, reservation)
  if (!started) {
    set(releaseConditionalFormatMutationLaunchAtom, reservation)
    return
  }
  const launchCurrent = set(guardConditionalFormatTransportLaunchAtom, reservation)
  set(releaseConditionalFormatMutationLaunchAtom, reservation)
  if (!launchCurrent) return
  let acknowledgementValue: unknown
  try {
    const request = copyMutationRequest(reservation.request)
    acknowledgementValue = request.kind === 'set-conditional-format-rule' ? await Promise.resolve(reservation.input.setRule!(request)) : await Promise.resolve(reservation.input.removeRule!(request))
  } catch (error) {
    const message = errorMessage(error)
    set(settleConditionalFormatAttemptAtom, { ticket: reservation.ticket, status: 'outcome-unknown', error: message })
    set(updateOwnedConditionalFormatEditorAtom, { ticket: reservation.ticket, error: message })
    return
  }
  const acknowledgementSnapshot = snapshotAcknowledgement(acknowledgementValue, reservation.ticket)
  if (acknowledgementSnapshot.acknowledgement === null) {
    const message = acknowledgementSnapshot.error ?? 'Conditional formatting acknowledgement was invalid'
    set(settleConditionalFormatAttemptAtom, { ticket: reservation.ticket, status: 'outcome-unknown', error: message })
    set(updateOwnedConditionalFormatEditorAtom, { ticket: reservation.ticket, error: message })
    return
  }
  const acknowledgement = acknowledgementSnapshot.acknowledgement
  set(settleConditionalFormatAttemptAtom, { ticket: reservation.ticket, status: 'acknowledged', resultRevision: acknowledgement.revision })
  const isCurrentTarget = (): boolean => {
    try { return set(conditionalFormatCurrentTargetAtom, reservation.ticket) } catch { return false }
  }
  if (!isCurrentTarget()) return
  let followupError: string | null = null
  if (reservation.input.acceptAcknowledgedResult !== undefined) {
    try { await reservation.input.acceptAcknowledgedResult(acknowledgement) } catch (error) { followupError = errorMessage(error) }
  }
  if (!isCurrentTarget()) return
  if (reservation.input.listRules !== undefined) {
    try {
      const resultValue = await Promise.resolve(reservation.input.listRules({ kind: 'list-conditional-format-rules', sheetId: reservation.ticket.sheetId, requestId: reservation.ticket.requestId, revision: acknowledgement.revision }))
      const resultSnapshot = snapshotRulesResult(resultValue, reservation.ticket)
      if (resultSnapshot.result === null) followupError ??= resultSnapshot.error ?? 'Conditional formatting rules response was invalid'
      else if (isCurrentTarget()) set(acceptConditionalFormatRulesResultAtom, { ticket: reservation.ticket, cache: reservation.cache, result: resultSnapshot.result })
    } catch (error) { followupError ??= errorMessage(error) }
  }
  if (!isCurrentTarget()) return
  if (followupError !== null) {
    set(updateOwnedConditionalFormatEditorAtom, { ticket: reservation.ticket, error: `Mutation acknowledged; result acceptance failed: ${followupError}` })
    return
  }
  set(closeOwnedConditionalFormatEditorAtom, reservation.ticket)
}

export const runConditionalFormatMutationAtom = atom(
  null,
  (_get, set, input: RunConditionalFormatMutationInput): Promise<void> => {
    const reservation = set(reserveConditionalFormatMutationLaunchAtom, input)
    if (reservation === null) return Promise.resolve()
    return Promise.resolve().then(() => executeReservedConditionalFormatMutation(set, reservation))
  },
)
runConditionalFormatMutationAtom.debugLabel = 'spreadsheet.conditionalFormat.runMutation'
