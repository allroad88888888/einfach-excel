import type { Getter } from '@einfach/core'
import type { BackendMutationResult } from '../backend/types'
import { sameRange } from './identity'
import {
  activeTextToColumnsMutationAtom,
  textToColumnsLifecycleAtom,
  textToColumnsOpenAtom,
  textToColumnsSessionAtom,
  textToColumnsSessionIdAtom,
  type TextToColumnsMutationTicket,
} from './state'

export function textToColumnsAcknowledgementMatches(
  acknowledgement: unknown,
  ticket: TextToColumnsMutationTicket,
): acknowledgement is BackendMutationResult {
  try {
    if (typeof acknowledgement !== 'object' || acknowledgement === null) return false
    const result = acknowledgement as BackendMutationResult
    const revisionIsWitness =
      (typeof result.revision === 'number' && Number.isFinite(result.revision)) ||
      (typeof result.revision === 'string' && result.revision.length > 0)
    return result.sheetId === ticket.sheetId && result.requestId === ticket.requestId &&
      result.affectedRange !== undefined && sameRange(result.affectedRange, ticket.target) &&
      revisionIsWitness
  } catch { return false }
}

export function numericTextToColumnsHistoryRevision(result: BackendMutationResult): number | null {
  return typeof result.revision === 'number' && Number.isFinite(result.revision) ? result.revision : null
}

export function textToColumnsMutationTicketIsCurrent(
  get: Getter,
  ticket: TextToColumnsMutationTicket,
): boolean {
  const active = get(activeTextToColumnsMutationAtom)
  const lifecycle = get(textToColumnsLifecycleAtom)
  const session = get(textToColumnsSessionAtom)
  return active !== null && active.sessionId === ticket.sessionId && active.requestId === ticket.requestId &&
    get(textToColumnsOpenAtom) && get(textToColumnsSessionIdAtom) === ticket.sessionId &&
    session?.sessionId === ticket.sessionId && session.sheetId === ticket.sheetId &&
    lifecycle.sessionId === ticket.sessionId && lifecycle.requestId === ticket.requestId
}
