import { atom, type Getter, type Setter } from '@einfach/core'
import { projectionSnapshotAtom } from '../projection'
import {
  runVisibleProjectionAtom,
  type RunVisibleProjectionInput,
} from '../projection/run-visible-projection'
import { spreadsheetBackendBindingAtom } from '../runtime/backend-state'
import { retryEditingRefreshAtom } from './retry-refresh'
import { runEditingCommitAtom } from './run-commit'
import { editingSessionAtom } from './session-atoms'
import type { EditingCommitOutcome } from './types'

function currentVisibleRefreshInput(
  get: Getter,
  sheetId: string,
): RunVisibleProjectionInput | null {
  const request = get(projectionSnapshotAtom).request
  if (request?.kind !== 'visible-window' || request.sheetId !== sheetId) return null
  return Object.freeze({
    sheetId,
    window: request.window,
    reason: 'viewport',
    retainResult: true,
  })
}

async function refreshVisibleProjection(get: Getter, set: Setter, sheetId: string): Promise<void> {
  const input = currentVisibleRefreshInput(get, sheetId)
  if (input === null) throw new Error('The current visible projection is unavailable.')
  const outcome = await set(runVisibleProjectionAtom, input)
  if (outcome.status === 'failed') throw new Error(outcome.error)
  if (outcome.status === 'superseded') {
    throw new Error('Projection refresh was superseded.')
  }
}

/** Commits the current cell draft through this store's backend and visible window. */
export const commitCellEditingAtom = atom(null, async (get, set): Promise<EditingCommitOutcome> => {
  const session = get(editingSessionAtom)
  const binding = get(spreadsheetBackendBindingAtom)
  if (session.source === null || binding === null) return 'blocked'
  if (currentVisibleRefreshInput(get, session.source.sheetId) === null) return 'blocked'

  return set(runEditingCommitAtom, {
    source: binding.backend,
    commitSource: 'cell',
    move: 'none',
    refreshProjection: (sheetId) => refreshVisibleProjection(get, set, sheetId),
  })
})

commitCellEditingAtom.debugLabel = 'spreadsheet.editing.commitCell'

/** Retries the acknowledged edit's projection refresh through the current visible window. */
export const retryCellEditingRefreshAtom = atom(
  null,
  async (get, set): Promise<EditingCommitOutcome> => {
    const session = get(editingSessionAtom)
    if (session.source === null) return 'blocked'
    if (currentVisibleRefreshInput(get, session.source.sheetId) === null) return 'blocked'

    return set(retryEditingRefreshAtom, {
      refreshProjection: (sheetId) => refreshVisibleProjection(get, set, sheetId),
    })
  },
)

retryCellEditingRefreshAtom.debugLabel = 'spreadsheet.editing.retryCellRefresh'
