import { atom } from '@einfach/core'
import {
  acquireHistoryProducerReservationAtom,
  releaseHistoryProducerReservationAtom,
} from '../history'
import { setViewportFilterHiddenRowsAtom } from '../viewport/effective-hidden'
import type { RunFilterSortMutationInput, SetFilterSortRequest } from './types'
import {
  FILTER_SORT_ACKNOWLEDGEMENT_ERROR,
  FILTER_SORT_CAPABILITY_ERROR,
  FILTER_SORT_INVALID_INPUT_ERROR,
  FILTER_SORT_PENDING_ERROR,
  FILTER_SORT_REFRESH_TIMEOUT_ERROR,
  FILTER_SORT_STALE_OPERATION_ERROR,
  FILTER_SORT_TRANSPORT_TIMEOUT_ERROR,
} from './constants'
import { mutationTicketAuthorityIsCurrent } from './authority-domain'
import {
  classifyFilterSortAcknowledgement,
  recordFilterSortHistory,
} from './acknowledgement-domain'
import {
  activeFilterSortEntrypointAtom,
  activeFilterSortMutationAtom,
  filterSortCapabilityBackingAtom,
  filterSortDraftBackingAtom,
  filterSortErrorBackingAtom,
  filterSortLifecycleBackingAtom,
  filterSortStateBackingAtom,
  filterSortSyncTicketBackingAtom,
} from './state'
import {
  filterDropdownAtom,
  filterSortDraftAtom,
  filterSortLifecycleAtom,
  filterSortStateAtom,
  filterSortSyncTicketAtom,
} from './projection-atoms'
import {
  EMPTY_FILTER_SORT_STATE,
  deriveMutationState,
  draftFromState,
  errorMessage,
  lifecycleFor,
  nextFilterSortRequestId,
  normalizeState,
  refreshFailureError,
  runBoundedOperation,
  stateStoreWith,
} from './value-domain'
import type { FilterSortMutationTicket } from './internal-types'
import { captureFilterSortMutationInput } from './filter-sort-mutation-input'
import { createFilterSortMutationTicketControl } from './filter-sort-mutation-ticket-control'
export const runFilterSortMutationAtom = atom(
  null,
  async (get, set, input: RunFilterSortMutationInput): Promise<void> => {
    if (get(activeFilterSortMutationAtom) !== null || get(activeFilterSortEntrypointAtom) !== null)
      return
    const captured = captureFilterSortMutationInput(input)
    if (get(activeFilterSortMutationAtom) !== null || get(activeFilterSortEntrypointAtom) !== null)
      return
    const dropdown = get(filterDropdownAtom)
    const draft = get(filterSortDraftAtom)
    const lifecycle = get(filterSortLifecycleAtom)
    if (captured.kind === 'invalid') {
      set(filterSortErrorBackingAtom, FILTER_SORT_INVALID_INPUT_ERROR)
      set(
        filterSortLifecycleBackingAtom,
        lifecycleFor('blocked', draft.sessionId, draft.sheetId, draft.colIndex),
      )
      return
    }
    if (
      dropdown.status !== 'open' ||
      captured.sessionId !== draft.sessionId ||
      lifecycle.sessionId !== draft.sessionId ||
      dropdown.sheetId !== draft.sheetId ||
      dropdown.colIndex !== draft.colIndex ||
      ['pending', 'local-acknowledged', 'refreshing'].includes(lifecycle.status)
    )
      return
    if (typeof captured.transport !== 'function') {
      set(filterSortCapabilityBackingAtom, false)
      set(filterSortErrorBackingAtom, FILTER_SORT_CAPABILITY_ERROR)
      set(
        filterSortLifecycleBackingAtom,
        lifecycleFor('blocked', draft.sessionId, draft.sheetId, draft.colIndex),
      )
      return
    }
    set(filterSortCapabilityBackingAtom, true)
    const sheetId = draft.sheetId
    const colIndex = draft.colIndex
    if (sheetId === null || colIndex === null) return
    const derived = deriveMutationState(
      get(filterSortStateAtom)[sheetId] ?? EMPTY_FILTER_SORT_STATE,
      draft,
      captured.intent,
    )
    if (derived.state === null) {
      set(filterSortErrorBackingAtom, derived.error ?? FILTER_SORT_INVALID_INPUT_ERROR)
      set(
        filterSortLifecycleBackingAtom,
        lifecycleFor('blocked', draft.sessionId, sheetId, colIndex),
      )
      return
    }
    const requestId = nextFilterSortRequestId(get(filterSortSyncTicketAtom))
    if (requestId === null) {
      set(filterSortErrorBackingAtom, 'Filter and sort request identity space is exhausted.')
      set(
        filterSortLifecycleBackingAtom,
        lifecycleFor('blocked', draft.sessionId, sheetId, colIndex),
      )
      return
    }
    const next = normalizeState(derived.state)
    const request: SetFilterSortRequest = Object.freeze({
      kind: 'set-filter-sort',
      sheetId,
      rules: next.rules,
      requestId,
      recordHistory: true,
    })
    const historyReservation = set(acquireHistoryProducerReservationAtom)
    if (historyReservation === null) {
      set(filterSortErrorBackingAtom, FILTER_SORT_PENDING_ERROR)
      set(
        filterSortLifecycleBackingAtom,
        lifecycleFor('blocked', draft.sessionId, sheetId, colIndex),
      )
      return
    }
    const ticket: FilterSortMutationTicket = Object.freeze({
      sessionId: draft.sessionId,
      requestId,
      sheetId,
      colIndex,
      next,
      request,
      sourceWitness: captured.sourceWitness,
      transport: captured.transport,
      refreshProjection: captured.refreshProjection,
      timeoutMs: captured.timeoutMs,
      historyEntryRecorder: captured.historyEntryRecorder,
      historyReservation,
    })
    set(filterSortSyncTicketBackingAtom, requestId)
    set(activeFilterSortMutationAtom, ticket)
    set(filterSortErrorBackingAtom, '')
    set(
      filterSortLifecycleBackingAtom,
      lifecycleFor('pending', ticket.sessionId, sheetId, colIndex, requestId),
    )
    const { owns, unknown, releaseUnsent } = createFilterSortMutationTicketControl(get, set, ticket)
    const authority = () => mutationTicketAuthorityIsCurrent(get, ticket)
    await Promise.resolve()
    if (!owns()) return
    if (!authority()) {
      releaseUnsent()
      return
    }
    set(filterSortLifecycleBackingAtom, get(filterSortLifecycleAtom))
    const transport = await runBoundedOperation(
      () => ticket.transport.call(ticket.sourceWitness, ticket.request),
      ticket.timeoutMs,
    )
    if (!owns()) return
    if (!authority()) {
      unknown(FILTER_SORT_STALE_OPERATION_ERROR)
      return
    }
    if (transport.kind === 'timeout') {
      unknown(FILTER_SORT_TRANSPORT_TIMEOUT_ERROR)
      return
    }
    if (transport.kind === 'rejected') {
      unknown(errorMessage(transport.error))
      return
    }
    const acknowledgement = classifyFilterSortAcknowledgement(transport.value, sheetId, requestId, {
      expectedHistoryRecorded: null,
      allowAbsentHiddenRowIndices: false,
    })
    if (!owns()) return
    if (!authority()) {
      unknown(FILTER_SORT_STALE_OPERATION_ERROR)
      return
    }
    if (acknowledgement.kind === 'invalid') {
      unknown(FILTER_SORT_ACKNOWLEDGEMENT_ERROR)
      return
    }
    if (
      recordFilterSortHistory(
        set,
        acknowledgement,
        sheetId,
        ticket.historyReservation,
        ticket.historyEntryRecorder,
      ) === 'rejected'
    ) {
      unknown(FILTER_SORT_ACKNOWLEDGEMENT_ERROR)
      return
    }
    if (!owns()) return
    if (!authority()) {
      unknown(FILTER_SORT_STALE_OPERATION_ERROR)
      return
    }
    set(
      filterSortStateBackingAtom,
      stateStoreWith(get(filterSortStateBackingAtom), sheetId, ticket.next),
    )
    set(setViewportFilterHiddenRowsAtom, { sheetId, rows: acknowledgement.hiddenRowIndices })
    set(
      filterSortDraftBackingAtom,
      draftFromState(
        ticket.sessionId,
        sheetId,
        colIndex,
        ticket.next,
        get(filterSortDraftAtom).availableValues,
      ),
    )
    set(
      filterSortLifecycleBackingAtom,
      lifecycleFor('local-acknowledged', ticket.sessionId, sheetId, colIndex, requestId),
    )
    await Promise.resolve()
    if (!owns()) return
    if (!authority()) {
      unknown(FILTER_SORT_STALE_OPERATION_ERROR)
      return
    }
    set(
      filterSortLifecycleBackingAtom,
      lifecycleFor('refreshing', ticket.sessionId, sheetId, colIndex, requestId),
    )
    const refresh = await runBoundedOperation(
      () => ticket.refreshProjection(sheetId),
      ticket.timeoutMs,
    )
    if (!owns()) return
    if (!authority()) {
      unknown(FILTER_SORT_STALE_OPERATION_ERROR)
      return
    }
    if (refresh.kind === 'timeout') {
      set(filterSortErrorBackingAtom, refreshFailureError(FILTER_SORT_REFRESH_TIMEOUT_ERROR))
      set(
        filterSortLifecycleBackingAtom,
        lifecycleFor('refresh-failed', ticket.sessionId, sheetId, colIndex, requestId),
      )
      return
    }
    if (refresh.kind === 'rejected') {
      set(filterSortErrorBackingAtom, refreshFailureError(refresh.error))
      set(
        filterSortLifecycleBackingAtom,
        lifecycleFor('refresh-failed', ticket.sessionId, sheetId, colIndex, requestId),
      )
      return
    }
    if (!set(releaseHistoryProducerReservationAtom, ticket.historyReservation)) {
      unknown(FILTER_SORT_ACKNOWLEDGEMENT_ERROR)
      return
    }
    if (!owns()) return
    if (!authority()) {
      unknown(FILTER_SORT_STALE_OPERATION_ERROR)
      set(activeFilterSortMutationAtom, null)
      return
    }
    set(filterSortErrorBackingAtom, '')
    set(
      filterSortLifecycleBackingAtom,
      lifecycleFor('editing', ticket.sessionId, sheetId, colIndex),
    )
    set(activeFilterSortMutationAtom, null)
  },
)
runFilterSortMutationAtom.debugLabel = 'spreadsheet.filterSort.runMutation'
