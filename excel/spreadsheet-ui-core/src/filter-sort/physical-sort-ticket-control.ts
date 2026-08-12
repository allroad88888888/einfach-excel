import type { Getter, Setter } from '@einfach/core'
import { releaseHistoryProducerReservationAtom } from '../history'
import { FILTER_SORT_ACKNOWLEDGEMENT_ERROR, FILTER_SORT_STALE_OPERATION_ERROR } from './constants'
import type { PhysicalSortTicket } from './internal-types'
import { activeFilterSortEntrypointAtom, filterSortEntrypointStateBackingAtom } from './state'
import { entrypointStateForTicket, outcomeUnknownError } from './value-domain'

export interface PhysicalSortTicketControl {
  readonly owns: () => boolean
  readonly unknown: (detail: string) => void
  readonly markUnknown: (detail: string) => void
  readonly releaseUnsent: () => void
}

export function createPhysicalSortTicketControl(
  get: Getter,
  set: Setter,
  ticket: PhysicalSortTicket,
): PhysicalSortTicketControl {
  const owns = () => get(activeFilterSortEntrypointAtom) === ticket
  const markUnknown = (detail: string) =>
    set(
      filterSortEntrypointStateBackingAtom,
      entrypointStateForTicket('outcome-unknown', ticket, outcomeUnknownError(detail)),
    )
  const unknown = (detail: string) => {
    if (owns()) markUnknown(detail)
  }
  const releaseUnsent = () => {
    if (!owns()) return
    if (!set(releaseHistoryProducerReservationAtom, ticket.historyReservation)) {
      unknown(FILTER_SORT_ACKNOWLEDGEMENT_ERROR)
      return
    }
    if (!owns()) return
    set(
      filterSortEntrypointStateBackingAtom,
      entrypointStateForTicket('stale', ticket, FILTER_SORT_STALE_OPERATION_ERROR),
    )
    set(activeFilterSortEntrypointAtom, null)
  }
  return Object.freeze({ owns, unknown, markUnknown, releaseUnsent })
}
