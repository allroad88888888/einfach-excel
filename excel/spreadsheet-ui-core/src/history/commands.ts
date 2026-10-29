import { atom } from '@einfach/core'
import type { HistoryCommandOutcome, RunHistoryCommandInput } from './types'
import { INITIAL_HISTORY_STACK, lifecycleFor } from './backing-state'
import { runHistoryAction } from './run-action'
import { historyStackAtom } from './projections'
import {
  activeHistoryProducerReservationAtom,
  activeHistoryTicketAtom,
  historyLifecycleBackingAtom,
  historyProjectionRevisionBackingAtom,
  historySessionSequenceAtom,
  historyStackBackingAtom,
} from './backing-atoms'

export const runUndoHistoryAtom = atom(
  null,
  (get, set, input: RunHistoryCommandInput): Promise<HistoryCommandOutcome> =>
    runHistoryAction('undo', get, set, input),
)
runUndoHistoryAtom.debugLabel = 'spreadsheet.history.runUndo'

export const runRedoHistoryAtom = atom(
  null,
  (get, set, input: RunHistoryCommandInput): Promise<HistoryCommandOutcome> =>
    runHistoryAction('redo', get, set, input),
)
runRedoHistoryAtom.debugLabel = 'spreadsheet.history.runRedo'

export const clearHistoryAtom = atom(
  (get) => get(historyStackAtom),
  (get, set): boolean => {
    if (
      get(activeHistoryTicketAtom) !== null ||
      get(activeHistoryProducerReservationAtom) !== null
    ) {
      return false
    }
    set(historyStackBackingAtom, INITIAL_HISTORY_STACK)
    set(historyProjectionRevisionBackingAtom, null)
    set(
      historyLifecycleBackingAtom,
      lifecycleFor('ready', { sessionId: get(historySessionSequenceAtom) }),
    )
    return true
  },
)
clearHistoryAtom.debugLabel = 'spreadsheet.history.clear'
