import { atom } from '@einfach/core'
import type { Getter, Setter } from '@einfach/core'
import type {
  HistoryEntry,
  HistoryProducerReservation,
  PushReservedHistoryInput,
} from './types'
import { DEFAULT_HISTORY_CAP } from './constants'
import { lifecycleFor, stackState } from './backing-state'
import { snapshotEntry } from './entry-snapshot'
import { historyStackAtom } from './projections'
import {
  activeHistoryProducerReservationAtom,
  activeHistoryTicketAtom,
  historyLifecycleBackingAtom,
  historyProjectionRevisionBackingAtom,
  historySessionSequenceAtom,
  historyStackBackingAtom,
} from './backing-atoms'

function appendHistoryEntry(
  get: Getter,
  set: Setter,
  entry: HistoryEntry,
  ownsProducerLane: () => boolean,
): boolean {
  if (!ownsProducerLane()) return false
  const snapshot = snapshotEntry(entry)
  // Snapshotting reads caller-owned input. Re-check the exact lane owner
  // afterwards so a re-entrant getter cannot release or replace the token and
  // still commit an entry.
  if (snapshot === null || !ownsProducerLane()) return false
  const state = get(historyStackBackingAtom)
  const base = state.entries.slice(0, state.cursor)
  const next = [...base, snapshot]
  const capped =
    next.length > DEFAULT_HISTORY_CAP ? next.slice(next.length - DEFAULT_HISTORY_CAP) : next
  set(historyStackBackingAtom, stackState(capped, capped.length))
  // Local-replay entries never advance the backend revision witness —
  // their revisions are session-local labels and mixing them into the
  // strict backend witness would poison later transactional undo.
  if (!snapshot.localReplay) {
    set(historyProjectionRevisionBackingAtom, snapshot.projectionRevision)
  }
  set(
    historyLifecycleBackingAtom,
    lifecycleFor('ready', { sessionId: get(historySessionSequenceAtom) }),
  )
  return true
}

/**
 * Acquire the shared producer lane synchronously, before launching transport.
 * A retained terminal history ticket is still an owner even when `inFlight`
 * projects false, so it blocks producer acquisition until its own workflow
 * explicitly reconciles.
 */
export const acquireHistoryProducerReservationAtom = atom(
  null,
  (get, set): HistoryProducerReservation | null => {
    if (
      get(activeHistoryTicketAtom) !== null ||
      get(activeHistoryProducerReservationAtom) !== null
    ) {
      return null
    }
    const reservation = Object.freeze(
      Object.create(null) as Record<PropertyKey, never>,
    ) as unknown as HistoryProducerReservation
    set(activeHistoryProducerReservationAtom, reservation)
    return reservation
  },
)
acquireHistoryProducerReservationAtom.debugLabel = 'spreadsheet.history.acquireProducerReservation'

/**
 * Append one descriptor for the current producer owner. A producer may call
 * this once per backend transaction while retaining the same reservation.
 */
export const pushReservedHistoryAtom = atom(
  (get) => get(historyStackAtom),
  (get, set, input: PushReservedHistoryInput): boolean => {
    let reservation: HistoryProducerReservation
    let entry: HistoryEntry
    try {
      reservation = input.reservation
      entry = input.entry
    } catch {
      return false
    }
    const ownsProducerLane = (): boolean =>
      get(activeHistoryProducerReservationAtom) === reservation &&
      get(activeHistoryTicketAtom) === null
    if (!ownsProducerLane()) return false
    return appendHistoryEntry(get, set, entry, ownsProducerLane)
  },
)
pushReservedHistoryAtom.debugLabel = 'spreadsheet.history.pushReservedEntry'

/** Release the producer lane only when the exact current owner asks. */
export const releaseHistoryProducerReservationAtom = atom(
  null,
  (get, set, reservation: HistoryProducerReservation): boolean => {
    if (get(activeHistoryProducerReservationAtom) !== reservation) return false
    set(activeHistoryProducerReservationAtom, null)
    return true
  },
)
releaseHistoryProducerReservationAtom.debugLabel = 'spreadsheet.history.releaseProducerReservation'

export const pushHistoryAtom = atom(
  (get) => get(historyStackAtom),
  (get, set, entry: HistoryEntry): boolean => {
    const reservation = set(acquireHistoryProducerReservationAtom)
    if (reservation === null) return false
    const ownsProducerLane = (): boolean =>
      get(activeHistoryProducerReservationAtom) === reservation &&
      get(activeHistoryTicketAtom) === null
    try {
      return appendHistoryEntry(get, set, entry, ownsProducerLane)
    } finally {
      // Exact release is the last write by the legacy push. A synchronous
      // subscriber may start a replacement producer from this notification.
      set(releaseHistoryProducerReservationAtom, reservation)
    }
  },
)
pushHistoryAtom.debugLabel = 'spreadsheet.history.pushEntry'
