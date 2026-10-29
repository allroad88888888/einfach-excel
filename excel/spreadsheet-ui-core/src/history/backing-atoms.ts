import { atom } from '@einfach/core'
import type { ProjectionRevision } from '../backend/types'
import type { HistoryLifecycleState, HistoryProducerReservation } from './types'
import {
  INITIAL_HISTORY_LIFECYCLE,
  INITIAL_HISTORY_STACK,
  type HistoryMutationTicket,
  type HistoryStackBackingState,
} from './backing-state'

export const historyStackBackingAtom = atom<HistoryStackBackingState>(INITIAL_HISTORY_STACK)
historyStackBackingAtom.debugLabel = 'spreadsheet.history.stackBacking'

export const historyLifecycleBackingAtom = atom<HistoryLifecycleState>(INITIAL_HISTORY_LIFECYCLE)
historyLifecycleBackingAtom.debugLabel = 'spreadsheet.history.lifecycleBacking'

export const historyProjectionRevisionBackingAtom = atom<ProjectionRevision | null>(null)
historyProjectionRevisionBackingAtom.debugLabel = 'spreadsheet.history.projectionRevisionBacking'

export const activeHistoryTicketAtom = atom<HistoryMutationTicket | null>(null)
activeHistoryTicketAtom.debugLabel = 'spreadsheet.history.activeTicket'

export const activeHistoryProducerReservationAtom = atom<HistoryProducerReservation | null>(null)
activeHistoryProducerReservationAtom.debugLabel = 'spreadsheet.history.activeProducerReservation'

export const historySessionSequenceAtom = atom<number>(0)
historySessionSequenceAtom.debugLabel = 'spreadsheet.history.sessionSequence'

export const historyRequestSequenceAtom = atom<number>(0)
historyRequestSequenceAtom.debugLabel = 'spreadsheet.history.requestSequence'
