import type { Getter, Setter } from '@einfach/core'
import { releaseHistoryProducerReservationAtom } from '../history'
import { FILTER_SORT_ACKNOWLEDGEMENT_ERROR, FILTER_SORT_STALE_OPERATION_ERROR } from './constants'
import type { FilterSortMutationTicket } from './internal-types'
import {
  activeFilterSortMutationAtom,
  filterSortErrorBackingAtom,
  filterSortLifecycleBackingAtom,
} from './state'
import { lifecycleFor } from './operation-state'
import { outcomeUnknownError } from './transport-values'

export interface FilterSortMutationTicketControl {
  readonly owns: () => boolean
  readonly unknown: (detail: string) => void
  readonly releaseUnsent: () => void
}

export function createFilterSortMutationTicketControl(
  get: Getter,
  set: Setter,
  ticket: FilterSortMutationTicket,
): FilterSortMutationTicketControl {
  const owns = () => get(activeFilterSortMutationAtom) === ticket
  const unknown = (detail: string) => {
    if (!owns()) return
    set(filterSortErrorBackingAtom, outcomeUnknownError(detail))
    set(
      filterSortLifecycleBackingAtom,
      lifecycleFor(
        'outcome-unknown',
        ticket.sessionId,
        ticket.sheetId,
        ticket.colIndex,
        ticket.requestId,
      ),
    )
  }
  const releaseUnsent = () => {
    if (!owns()) return
    if (!set(releaseHistoryProducerReservationAtom, ticket.historyReservation)) {
      unknown(FILTER_SORT_ACKNOWLEDGEMENT_ERROR)
      return
    }
    if (!owns()) return
    set(filterSortErrorBackingAtom, FILTER_SORT_STALE_OPERATION_ERROR)
    set(
      filterSortLifecycleBackingAtom,
      lifecycleFor('blocked', ticket.sessionId, ticket.sheetId, ticket.colIndex),
    )
    set(activeFilterSortMutationAtom, null)
  }
  return Object.freeze({ owns, unknown, releaseUnsent })
}
