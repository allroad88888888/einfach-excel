import { atom } from '@einfach/core'
import type { Getter, Setter } from '@einfach/core'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { pushHistoryAtom } from '../history'
import {
  TEXT_TO_COLUMNS_ACKNOWLEDGEMENT_ERROR,
  TEXT_TO_COLUMNS_CAPABILITY_ERROR,
  TEXT_TO_COLUMNS_CONTEXT_ERROR,
  TEXT_TO_COLUMNS_OUTCOME_UNKNOWN_ERROR,
  TEXT_TO_COLUMNS_REFRESH_ERROR_PREFIX,
} from './constants'
import { buildTextToColumnsCommitPlan, textToColumnsCommitTargetRange } from './commit-plan'
import { nextTextToColumnsRequestId } from './identity'
import {
  numericTextToColumnsHistoryRevision,
  textToColumnsAcknowledgementMatches,
  textToColumnsMutationTicketIsCurrent,
} from './mutation-domain'
import { closeTextToColumnsSession } from './session-command'
import {
  activeTextToColumnsMutationAtom,
  lifecycleFor,
  textToColumnsCapabilityStateAtom,
  textToColumnsErrorMessage,
  textToColumnsErrorStateAtom,
  textToColumnsLifecycleAtom,
  textToColumnsLifecycleStateAtom,
  textToColumnsOpenAtom,
  textToColumnsRequestIdAtom,
  textToColumnsRequestIdStateAtom,
  textToColumnsSessionAtom,
  type TextToColumnsMutationTicket,
} from './state'
import type {
  RunTextToColumnsFinishInput,
  TextToColumnsMutationOutcome,
} from './types'

function importCellChunksPort(input: RunTextToColumnsFinishInput) {
  try { return input.source?.importCellChunks } catch { return undefined }
}

function setTextToColumnsLifecycleError(
  set: Setter,
  ticket: TextToColumnsMutationTicket,
  error: unknown,
): void {
  set(textToColumnsErrorStateAtom, `${TEXT_TO_COLUMNS_REFRESH_ERROR_PREFIX}${textToColumnsErrorMessage(error)}`)
  set(textToColumnsLifecycleStateAtom, lifecycleFor('error', ticket.sessionId, ticket.sheetId, ticket.requestId))
}

export const runTextToColumnsFinishAtom = atom(
  null,
  async (get, set, input: RunTextToColumnsFinishInput): Promise<TextToColumnsMutationOutcome> => {
    const active = get(activeTextToColumnsMutationAtom)
    if (active !== null) return retryAcknowledgedTextToColumnsRefresh(get, set, input, active)
    const session = get(textToColumnsSessionAtom)
    const lifecycle = get(textToColumnsLifecycleAtom)
    if (
      !get(textToColumnsOpenAtom) || session === null || input.sessionId !== session.sessionId ||
      lifecycle.sessionId !== session.sessionId || lifecycle.status === 'pending' ||
      lifecycle.status === 'local-acknowledged' || lifecycle.status === 'refreshing' ||
      lifecycle.status === 'outcome-unknown'
    ) return 'stale'
    const execute = importCellChunksPort(input)
    if (typeof execute !== 'function') {
      set(textToColumnsCapabilityStateAtom, false)
      set(textToColumnsErrorStateAtom, TEXT_TO_COLUMNS_CAPABILITY_ERROR)
      set(textToColumnsLifecycleStateAtom, lifecycleFor('blocked', session.sessionId, session.sheetId))
      return 'blocked'
    }
    set(textToColumnsCapabilityStateAtom, true)
    const plan = buildTextToColumnsCommitPlan(get)
    const target = plan === null ? null : textToColumnsCommitTargetRange(plan)
    if (plan === null || target === null || session.rows.length === 0 || typeof input.refreshProjection !== 'function') {
      set(textToColumnsErrorStateAtom, TEXT_TO_COLUMNS_CONTEXT_ERROR)
      set(textToColumnsLifecycleStateAtom, lifecycleFor('blocked', session.sessionId, session.sheetId))
      return 'blocked'
    }
    const resolution = set(resolveContentMutationAtom, {
      kind: 'import-cell-chunks', sheetId: session.sheetId, range: target,
    })
    if (resolution.status === 'blocked') {
      set(textToColumnsErrorStateAtom, resolution.diagnostic.message)
      set(textToColumnsLifecycleStateAtom, lifecycleFor('blocked', session.sessionId, session.sheetId))
      return 'blocked'
    }
    const requestId = nextTextToColumnsRequestId(get(textToColumnsRequestIdAtom))
    if (requestId === null) {
      set(textToColumnsErrorStateAtom, 'Text to Columns request identity space is exhausted.')
      set(textToColumnsLifecycleStateAtom, lifecycleFor('blocked', session.sessionId, session.sheetId))
      return 'blocked'
    }
    const request = Object.freeze({
      kind: 'import-cell-chunks' as const, sheetId: session.sheetId,
      chunks: Object.freeze([plan.cells]), range: target, requestId,
    })
    const ticket: TextToColumnsMutationTicket = Object.freeze({
      sessionId: session.sessionId, requestId, sheetId: session.sheetId, target, request,
      acknowledgement: null,
    })
    set(textToColumnsRequestIdStateAtom, requestId)
    set(activeTextToColumnsMutationAtom, ticket)
    set(textToColumnsErrorStateAtom, '')
    set(textToColumnsLifecycleStateAtom, lifecycleFor('pending', ticket.sessionId, ticket.sheetId, ticket.requestId))
    await Promise.resolve()
    if (!textToColumnsMutationTicketIsCurrent(get, ticket)) return 'stale'
    set(textToColumnsLifecycleStateAtom, get(textToColumnsLifecycleAtom))
    let acknowledgement: unknown
    try {
      acknowledgement = await execute.call(input.source, ticket.request)
    } catch (error) {
      if (!textToColumnsMutationTicketIsCurrent(get, ticket)) return 'stale'
      set(textToColumnsErrorStateAtom, `${TEXT_TO_COLUMNS_OUTCOME_UNKNOWN_ERROR} Backend detail: ${textToColumnsErrorMessage(error)}`)
      set(textToColumnsLifecycleStateAtom, lifecycleFor('outcome-unknown', ticket.sessionId, ticket.sheetId, ticket.requestId))
      return 'outcome-unknown'
    }
    if (!textToColumnsMutationTicketIsCurrent(get, ticket)) return 'stale'
    if (!textToColumnsAcknowledgementMatches(acknowledgement, ticket)) {
      set(textToColumnsErrorStateAtom, `${TEXT_TO_COLUMNS_OUTCOME_UNKNOWN_ERROR} ${TEXT_TO_COLUMNS_ACKNOWLEDGEMENT_ERROR}`)
      set(textToColumnsLifecycleStateAtom, lifecycleFor('outcome-unknown', ticket.sessionId, ticket.sheetId, ticket.requestId))
      return 'outcome-unknown'
    }
    const acknowledgedTicket: TextToColumnsMutationTicket = Object.freeze({ ...ticket, acknowledgement })
    set(activeTextToColumnsMutationAtom, acknowledgedTicket)
    const projectionRevision = numericTextToColumnsHistoryRevision(acknowledgement)
    if (projectionRevision !== null) set(pushHistoryAtom, {
      transactionId: `text-to-columns-${ticket.sessionId}-${ticket.requestId}`,
      kind: 'cells.import', sheetId: ticket.sheetId, projectionRevision, affectedRange: ticket.target,
    })
    set(textToColumnsLifecycleStateAtom, lifecycleFor('local-acknowledged', ticket.sessionId, ticket.sheetId, ticket.requestId))
    await Promise.resolve()
    if (!textToColumnsMutationTicketIsCurrent(get, acknowledgedTicket)) return 'stale'
    set(textToColumnsLifecycleStateAtom, lifecycleFor('refreshing', ticket.sessionId, ticket.sheetId, ticket.requestId))
    try { await input.refreshProjection(ticket.sheetId) } catch (error) {
      if (!textToColumnsMutationTicketIsCurrent(get, acknowledgedTicket)) return 'stale'
      setTextToColumnsLifecycleError(set, ticket, error)
      return 'error'
    }
    if (!textToColumnsMutationTicketIsCurrent(get, acknowledgedTicket)) return 'stale'
    closeTextToColumnsSession(get, set)
    return 'completed'
  },
)
runTextToColumnsFinishAtom.debugLabel = 'spreadsheet.textToColumns.finish'

async function retryAcknowledgedTextToColumnsRefresh(
  get: Getter,
  set: Setter,
  input: RunTextToColumnsFinishInput,
  active: TextToColumnsMutationTicket,
): Promise<TextToColumnsMutationOutcome> {
  const lifecycle = get(textToColumnsLifecycleAtom)
  if (
    active.acknowledgement === null || lifecycle.status !== 'error' ||
    input.sessionId !== active.sessionId || typeof input.refreshProjection !== 'function'
  ) return lifecycle.status === 'outcome-unknown' ? 'outcome-unknown' : 'stale'
  set(textToColumnsErrorStateAtom, '')
  set(textToColumnsLifecycleStateAtom, lifecycleFor('refreshing', active.sessionId, active.sheetId, active.requestId))
  await Promise.resolve()
  if (!textToColumnsMutationTicketIsCurrent(get, active)) return 'stale'
  set(textToColumnsLifecycleStateAtom, get(textToColumnsLifecycleAtom))
  try { await input.refreshProjection(active.sheetId) } catch (error) {
    if (!textToColumnsMutationTicketIsCurrent(get, active)) return 'stale'
    setTextToColumnsLifecycleError(set, active, error)
    return 'error'
  }
  if (!textToColumnsMutationTicketIsCurrent(get, active)) return 'stale'
  closeTextToColumnsSession(get, set)
  return 'completed'
}
