import { atom } from '@einfach/core'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { nativeFilterFeedbackAtom } from '../filter/command'
import {
  applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type {
  AdvancedFilterCopyPreview, AdvancedFilterCopyRequest,
} from '../rust-workbook/advanced-filter-range-commands'

export interface WorksheetCriteriaPreview extends AdvancedFilterCopyPreview {
  readonly request: AdvancedFilterCopyRequest
  readonly revision: number
}

export const copyWorksheetCriteriaAtom = atom(null, async (get, set, input: {
  readonly preview: WorksheetCriteriaPreview
  readonly confirmOverwrite: boolean
}) => {
  const connection = get(rustWorkbookConnectionAtom)
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (!connection || witness.status !== 'ready' || visible?.kind !== 'visible-window')
    throw new Error('Wait for the worksheet to finish loading.')
  if (get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    get(nativeFilterFeedbackAtom).busy)
    throw new Error('Finish the current worksheet operation first.')

  const { preview, confirmOverwrite } = input
  if (preview.overwrittenCells > 0 && !confirmOverwrite)
    throw new Error('Confirm overwriting the occupied destination cells before copying.')
  const permission = set(resolveContentMutationAtom, {
    kind: 'copy-filtered-records', sheetId: preview.request.sheetId, range: preview.target,
  })
  if (permission.status === 'blocked') throw new Error(permission.diagnostic.message)
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) throw new Error('Could not allocate a projection request.')
  const projection = createVisibleProjectionRequest({
    sheetId: visible.sheetId, window: visible.window, viewport: visible.viewport,
    requestId, reason: 'toolbar',
  })
  const result = await connection.request('advancedFilter.copy', {
    ...preview.request, expectedRevision: preview.revision, projection,
    ...(preview.overwrittenCells > 0 ? {
      approval: { count: preview.overwrittenCells, target: preview.target },
    } : {}),
  })
  if (get(rustWorkbookConnectionAtom) !== connection) throw new Error('The workbook changed.')
  const applied = set(applyVisibleProjectionAtom, {
    witness, request: projection, result: result.projection,
  })
  if (applied.status === 'rejected')
    throw new Error('The records were copied. Refresh the worksheet before trying again.')
  return { target: result.target, matchedRows: result.matchedRows }
})
