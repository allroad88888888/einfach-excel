import type { Accessor } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import {
  runPhysicalSortAtom,
  selectionSnapshotAtom,
  workspaceSessionAtom,
  type SortDirection,
} from '@einfach/spreadsheet-ui-core'
import {
  createHistoryEntryRecorder,
  refreshVisibleProjection,
  resolveSortRange,
  useSpreadsheetBackend,
  useSpreadsheetUiStore,
} from '../provider'
import {
  SORT_RANGE_UNAVAILABLE_ERROR,
  beginSortConfirmationAtom,
  closeSortConfirmationAtom,
  consumeSortConfirmationAtom,
  retrySortConfirmationAtom,
  settleSortConfirmationAtom,
  sortConfirmationAtom,
  type SortConfirmationEntrypoint,
  type SortConfirmationState,
  type SortConfirmationTicket,
} from './sort-confirmation-state'

interface SortConfirmationController {
  readonly state: Accessor<SortConfirmationState>
  readonly begin: (direction: SortDirection) => void
  readonly cancel: () => void
  readonly confirm: () => void
  readonly retry: () => void
}

export function useSortConfirmation(
  entrypoint: SortConfirmationEntrypoint = 'toolbar',
): SortConfirmationController {
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const state = useAtomValue(sortConfirmationAtom)

  async function resolve(ticket: SortConfirmationTicket): Promise<void> {
    try {
      const range = await resolveSortRange(store, backend, ticket.target.sheetId, ticket.active)
      store.setter(
        settleSortConfirmationAtom,
        range === null
          ? { sessionId: ticket.sessionId, error: SORT_RANGE_UNAVAILABLE_ERROR }
          : { sessionId: ticket.sessionId, range },
      )
    } catch (error) {
      store.setter(settleSortConfirmationAtom, {
        sessionId: ticket.sessionId,
        error:
          error instanceof Error && error.message ? error.message : SORT_RANGE_UNAVAILABLE_ERROR,
      })
    }
  }

  function begin(direction: SortDirection): void {
    const snapshot = store.getter(selectionSnapshotAtom)
    const sheetId = snapshot.activeCell.sheetId || store.getter(workspaceSessionAtom).activeSheetId
    if (!sheetId || typeof backend.sortRange !== 'function') return
    const ticket = store.setter(beginSortConfirmationAtom, {
      direction,
      entrypoint,
      target: { sheetId, colIndex: snapshot.activeCell.col },
      active: { row: snapshot.activeCell.row, col: snapshot.activeCell.col },
    })
    if (ticket) void resolve(ticket)
  }

  function cancel(): void {
    store.setter(closeSortConfirmationAtom)
  }

  function retry(): void {
    const ticket = store.setter(retrySortConfirmationAtom)
    if (ticket) void resolve(ticket)
  }

  function confirm(): void {
    const confirmed = store.setter(consumeSortConfirmationAtom)
    if (!confirmed) return
    void store.setter(runPhysicalSortAtom, {
      source: backend,
      historyEntryRecorder: createHistoryEntryRecorder(backend),
      entrypoint: confirmed.entrypoint,
      direction: confirmed.direction,
      range: confirmed.range,
      target: confirmed.target,
      refreshProjection: (sheetId) => refreshVisibleProjection(store, backend, sheetId),
    })
  }

  return { state, begin, cancel, confirm, retry }
}
