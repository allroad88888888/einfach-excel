import type { Store } from '@einfach/core'
import {
  cancelEditingAtom,
  exitFormulaReferenceAtom,
  formulaReferenceSessionAtom,
  retryEditingRefreshAtom,
  runEditingCommitAtom,
  type EditingCommitOutcome,
  type EditingCommitMove,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { createHistoryEntryRecorder } from './history-entry-recorder'
import { refreshVisibleProjection } from './projection-refresh'

/**
 * Commit the active editing session by pulling the latest draft, running it
 * through the backend setCellInput port, pushing a history entry and
 * refreshing the visible projection. Used by both the formula bar and the
 * grid in-cell editor so the two paths share identical post-commit wiring.
 *
 * Returns the UI-core lifecycle outcome. The framework host never owns the
 * mutation acknowledgement, history cursor, or refresh retry state.
 */
export async function dispatchEditingCommit(
  store: Store,
  backend: SpreadsheetBackend,
  options: {
    move?: EditingCommitMove
    source?: 'cell' | 'formula-bar' | 'keyboard' | 'paste'
  } = {},
): Promise<EditingCommitOutcome> {
  // Clear any active formula-reference pick session before committing —
  // otherwise the next pointer click after commit would still route to
  // pickFormulaReferenceAtom and silently mutate an empty draft.
  if (store.getter(formulaReferenceSessionAtom) !== null) {
    store.setter(exitFormulaReferenceAtom, 'commit')
  }
  return store.setter(runEditingCommitAtom, {
    source: backend,
    move: options.move ?? 'none',
    commitSource: options.source ?? 'cell',
    historyEntryRecorder: createHistoryEntryRecorder(backend),
    refreshProjection: (sheetId) =>
      refreshVisibleProjection(store, backend, sheetId, 'formula-bar'),
  })
}

export async function retryEditingCommitRefresh(
  store: Store,
  backend: SpreadsheetBackend,
): Promise<EditingCommitOutcome> {
  return store.setter(retryEditingRefreshAtom, {
    refreshProjection: (sheetId) =>
      refreshVisibleProjection(store, backend, sheetId, 'formula-bar'),
  })
}

/**
 * Cancel the active editing session. Returns true if a session was active.
 */
export function dispatchEditingCancel(store: Store): boolean {
  // Make sure any in-flight formula-reference session is also cleared so the
  // grid does not stay in pick mode after the cell editor exits.
  if (store.getter(formulaReferenceSessionAtom) !== null) {
    store.setter(exitFormulaReferenceAtom, 'cancel')
  }
  const intent = store.setter(cancelEditingAtom)
  return intent !== null
}
