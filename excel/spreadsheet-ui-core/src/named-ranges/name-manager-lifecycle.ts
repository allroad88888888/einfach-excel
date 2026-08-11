import type { Getter, Setter } from '@einfach/core'
import {
  closeNameManagerEditor,
  nameManagerDraftGenerationSourceAtom,
  nameManagerEditorAtom,
  nameManagerSessionIdAtom,
} from './name-manager-draft'
import { resetNameManagerTableEditorAtom } from './name-manager-table-editor'
import { activeNamedRangeMutationTicketAtom, namedRangeCapabilityStateSourceAtom } from './state'
import type { ManagerCloseWitness, NamedRangeMutationTicket } from './internal-types'

export function closeOwnedManagerSessionAfterRefresh(
  get: Getter,
  set: Setter,
  witness: ManagerCloseWitness | undefined,
): void {
  if (witness === undefined) return
  const capability = get(namedRangeCapabilityStateSourceAtom)
  if (capability.status !== 'ready' || get(activeNamedRangeMutationTicketAtom) !== null) return
  if (get(nameManagerSessionIdAtom) !== witness.sessionId) return
  if (get(nameManagerDraftGenerationSourceAtom) !== witness.draftGeneration) return
  if (get(nameManagerEditorAtom).status === 'closed') return
  closeNameManagerEditor(get, set)
  set(resetNameManagerTableEditorAtom, get(nameManagerSessionIdAtom))
}

export function managerCloseWitnessForMutation(
  ticket: NamedRangeMutationTicket,
): ManagerCloseWitness | undefined {
  return ticket.origin === 'name-manager' && ticket.managerDraftGeneration !== null
    ? Object.freeze({ sessionId: ticket.sessionId, draftGeneration: ticket.managerDraftGeneration })
    : undefined
}
