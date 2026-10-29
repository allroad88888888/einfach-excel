import { atom } from '@einfach/core'
import type { Atom } from '@einfach/core'
import type { HistoryLifecycleState, HistoryStackState } from './types'
import { isTransportBusy } from './backing-state'
import {
  activeHistoryProducerReservationAtom,
  activeHistoryTicketAtom,
  historyLifecycleBackingAtom,
  historyStackBackingAtom,
} from './backing-atoms'

/** Read-only bounded history projection. Commands own all mutations. */
export const historyStackAtom: Atom<HistoryStackState> = atom((get) => {
  const stack = get(historyStackBackingAtom)
  return Object.freeze({
    entries: stack.entries,
    cursor: stack.cursor,
    inFlight: isTransportBusy(get(historyLifecycleBackingAtom).status),
  })
})
historyStackAtom.debugLabel = 'spreadsheet.history.stack'

/** Read-only lifecycle projection. The active ticket itself remains private to Core. */
export const historyLifecycleAtom: Atom<HistoryLifecycleState> = atom((get) =>
  get(historyLifecycleBackingAtom),
)
historyLifecycleAtom.debugLabel = 'spreadsheet.history.lifecycle'

export const historyInFlightAtom = atom((get) => get(historyStackAtom).inFlight)
historyInFlightAtom.debugLabel = 'spreadsheet.history.inFlight'

export const canUndoAtom = atom((get) => {
  const { entries, cursor } = get(historyStackBackingAtom)
  return (
    entries.length > 0 &&
    cursor > 0 &&
    get(activeHistoryTicketAtom) === null &&
    get(activeHistoryProducerReservationAtom) === null
  )
})
canUndoAtom.debugLabel = 'spreadsheet.history.canUndo'

export const canRedoAtom = atom((get) => {
  const { entries, cursor } = get(historyStackBackingAtom)
  return (
    cursor < entries.length &&
    get(activeHistoryTicketAtom) === null &&
    get(activeHistoryProducerReservationAtom) === null
  )
})
canRedoAtom.debugLabel = 'spreadsheet.history.canRedo'

export const historyCanRetryRefreshAtom = atom((get) => {
  const lifecycle = get(historyLifecycleAtom)
  const ticket = get(activeHistoryTicketAtom)
  return (
    ticket !== null &&
    lifecycle.status === 'refresh-failed' &&
    lifecycle.sessionId === ticket.sessionId &&
    lifecycle.requestId === ticket.requestId &&
    lifecycle.acknowledgedRevision !== null
  )
})
historyCanRetryRefreshAtom.debugLabel = 'spreadsheet.history.canRetryRefresh'
