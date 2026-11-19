import { atom } from '@einfach/core'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { nativeFilterFeedbackAtom } from '../filter/command'
import {
  applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom, validateProjectionResult,
} from '../projection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { sortFeedbackAtom } from '../sort/command'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
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
  const activeSheet = get(activeWorkbookSheetAtom)
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (!connection || !activeSheet || witness.status !== 'ready' ||
    visible?.kind !== 'visible-window' || visible.sheetId !== activeSheet.id)
    throw new Error('Wait for the worksheet to finish loading.')
  if (get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    get(nativeFilterFeedbackAtom).busy || get(nativeTableFeedbackAtom).busy ||
    get(selectionStructureFeedbackAtom).busy || get(sortFeedbackAtom).busy)
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
  const validated = validateProjectionResult(result.projection, { request: projection })
  if (!validated.ok)
    throw new Error('The records were copied. Refresh the worksheet before trying again.')
  const applied = set(applyVisibleProjectionAtom, {
    witness, request: projection, result: result.projection,
  })
  if (applied.status === 'rejected')
    throw new Error('The records were copied. Refresh the worksheet before trying again.')
  return { target: result.target, matchedRows: result.matchedRows }
})
copyWorksheetCriteriaAtom.debugLabel = 'spreadsheet.advancedFilter.copy'
