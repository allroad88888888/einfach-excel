import { atom } from '@einfach/core'
import type { Setter } from '@einfach/core'
import type { RangeProjectionRequest } from '../backend/types'
import { selectionAuthorityWitnessAtom } from '../selection'
import { workspaceActiveSheetAuthorityWitnessAtom } from '../workspace'
import {
  TEXT_TO_COLUMNS_ENTRYPOINT_PENDING_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_PORT_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_RESULT_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_SESSION_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_STALE_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_TARGET_ERROR,
  TEXT_TO_COLUMNS_ENTRYPOINT_TRANSPORT_ERROR_PREFIX,
} from './constants'
import {
  filterHiddenRowsForTextToColumns,
  nextTextToColumnsEntrypointAttempt,
  resolveTextToColumnsEntrypointTarget,
  textToColumnsEntrypointAuthorityIsCurrent,
  textToColumnsEntrypointStateFor,
  textToColumnsEntrypointStateForTicket,
  textToColumnsEntrypointTicketIsOwned,
  textToColumnsSourceRowsFromResult,
} from './entrypoint-domain'
import { nextSafeMonotonicIdentity, nextTextToColumnsRequestId } from './identity'
import { openTextToColumnsAtom } from './session-command'
import {
  activeTextToColumnsEntrypointAtom,
  activeTextToColumnsMutationAtom,
  textToColumnsEntrypointOperationIdStateAtom,
  textToColumnsEntrypointRequestIdStateAtom,
  textToColumnsEntrypointStateBackingAtom,
  textToColumnsErrorMessage,
  textToColumnsLifecycleStateAtom,
  textToColumnsOpenStateAtom,
  textToColumnsSessionIdAtom,
  textToColumnsSessionStateAtom,
  type TextToColumnsEntrypointTicket,
} from './state'
import type { RunTextToColumnsEntrypointInput, TextToColumnsEntrypointOutcome } from './types'

function entrypointInputPort(input: RunTextToColumnsEntrypointInput) {
  try { return input.source?.readRangeProjection } catch { return undefined }
}

export const runTextToColumnsEntrypointAtom = atom(
  null,
  async (get, set, input: RunTextToColumnsEntrypointInput): Promise<TextToColumnsEntrypointOutcome> => {
    if (get(activeTextToColumnsEntrypointAtom) !== null) return 'loading'
    const target = resolveTextToColumnsEntrypointTarget(get)
    const previous = get(textToColumnsEntrypointStateBackingAtom)
    const sessionId = get(textToColumnsSessionIdAtom)
    const attempt = target === null ? 1 : nextTextToColumnsEntrypointAttempt(previous, target)
    const session = get(textToColumnsSessionStateAtom)
    const open = get(textToColumnsOpenStateAtom)
    const lifecycle = get(textToColumnsLifecycleStateAtom)
    const mutation = get(activeTextToColumnsMutationAtom)
    if (mutation !== null) {
      set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateFor('blocked', {
        sessionId, target, attempt, error: TEXT_TO_COLUMNS_ENTRYPOINT_PENDING_ERROR,
      }))
      return 'blocked'
    }
    if (open || session !== null || lifecycle.status !== 'closed') {
      set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateFor('blocked', {
        sessionId, target, attempt, error: TEXT_TO_COLUMNS_ENTRYPOINT_SESSION_ERROR,
      }))
      return 'blocked'
    }
    if (target === null) {
      set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateFor('blocked', {
        sessionId, attempt, error: TEXT_TO_COLUMNS_ENTRYPOINT_TARGET_ERROR,
      }))
      return 'blocked'
    }
    const execute = entrypointInputPort(input)
    if (typeof execute !== 'function') {
      set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateFor('blocked', {
        sessionId, target, attempt, error: TEXT_TO_COLUMNS_ENTRYPOINT_PORT_ERROR,
      }))
      return 'blocked'
    }
    const operationId = nextSafeMonotonicIdentity(get(textToColumnsEntrypointOperationIdStateAtom))
    const requestId = nextTextToColumnsRequestId(get(textToColumnsEntrypointRequestIdStateAtom))
    if (operationId === null || requestId === null || !Number.isSafeInteger(sessionId)) {
      set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateFor('blocked', {
        sessionId, target, attempt, error: 'Text to Columns entrypoint identity space is exhausted.',
      }))
      return 'blocked'
    }
    const request: RangeProjectionRequest = Object.freeze({
      kind: 'range', sheetId: target.sheetId, range: target.range, requestId, reason: 'toolbar',
    })
    const ticket: TextToColumnsEntrypointTicket = Object.freeze({
      operationId, requestId, sessionId, session, open, lifecycle, mutation, target, attempt, request,
      selectionWitness: get(selectionAuthorityWitnessAtom),
      workspaceWitness: get(workspaceActiveSheetAuthorityWitnessAtom),
    })
    set(textToColumnsEntrypointOperationIdStateAtom, operationId)
    set(textToColumnsEntrypointRequestIdStateAtom, requestId)
    set(activeTextToColumnsEntrypointAtom, ticket)
    set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateForTicket('loading', ticket))
    await Promise.resolve()
    if (!textToColumnsEntrypointTicketIsOwned(get, ticket)) return 'stale'
    if (!textToColumnsEntrypointAuthorityIsCurrent(get, ticket)) return staleEntrypoint(set, ticket)
    set(textToColumnsEntrypointStateBackingAtom, get(textToColumnsEntrypointStateBackingAtom))
    let projection: unknown
    try {
      projection = await execute.call(input.source, ticket.request)
    } catch (error) {
      if (!textToColumnsEntrypointTicketIsOwned(get, ticket)) return 'stale'
      set(activeTextToColumnsEntrypointAtom, null)
      if (!textToColumnsEntrypointAuthorityIsCurrent(get, ticket)) return staleEntrypoint(set, ticket)
      set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateForTicket(
        'error', ticket, `${TEXT_TO_COLUMNS_ENTRYPOINT_TRANSPORT_ERROR_PREFIX}${textToColumnsErrorMessage(error)}`,
      ))
      return 'error'
    }
    if (!textToColumnsEntrypointTicketIsOwned(get, ticket)) return 'stale'
    if (!textToColumnsEntrypointAuthorityIsCurrent(get, ticket)) return staleEntrypoint(set, ticket)
    const rows = textToColumnsSourceRowsFromResult(
      projection, ticket, filterHiddenRowsForTextToColumns(get, ticket.target.sheetId),
    )
    if (rows === null) {
      set(activeTextToColumnsEntrypointAtom, null)
      set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateForTicket(
        'error', ticket, TEXT_TO_COLUMNS_ENTRYPOINT_RESULT_ERROR,
      ))
      return 'error'
    }
    const openedSessionId = set(openTextToColumnsAtom, {
      sheetId: ticket.target.sheetId, anchor: ticket.target.anchor, rows,
    })
    set(activeTextToColumnsEntrypointAtom, null)
    if (openedSessionId === null) {
      set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateForTicket(
        'error', ticket, 'Text to Columns source loaded, but the dialog session could not be opened.',
      ))
      return 'error'
    }
    set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateForTicket(
      'idle', ticket, '', openedSessionId,
    ))
    return 'opened'
  },
)
runTextToColumnsEntrypointAtom.debugLabel = 'spreadsheet.textToColumns.entrypoint.run'

function staleEntrypoint(set: Setter, ticket: TextToColumnsEntrypointTicket): 'stale' {
  set(activeTextToColumnsEntrypointAtom, null)
  set(textToColumnsEntrypointStateBackingAtom, textToColumnsEntrypointStateForTicket(
    'stale', ticket, TEXT_TO_COLUMNS_ENTRYPOINT_STALE_ERROR,
  ))
  return 'stale'
}
