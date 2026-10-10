import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { sortFeedbackAtom } from '../sort/command'
import { validFilterRange, type RustFilterAction } from '../rust-workbook/filter-commands'
import { validSheetVisibility } from '../viewport/hidden-state'
import { selectCellAtom, selectionSnapshotAtom, selectionAuthorityWitnessAtom, selectionRegionsAtom } from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'

const feedbackAtom = atom({ busy: false, error: '', message: '' })
export const nativeFilterFeedbackAtom = atom((get) => get(feedbackAtom))
export const nativeFilterRulesAtom = atom((get) => {
  const result = get(projectionSnapshotAtom).result
  return result?.kind === 'visible-window' && result.sheetId === get(activeWorkbookSheetAtom)?.id
    ? (result.filterRules ?? [])
    : []
})
export const nativeFilterRangeAtom = atom((get) => {
  const result = get(projectionSnapshotAtom).result
  return result?.kind === 'visible-window' && result.sheetId === get(activeWorkbookSheetAtom)?.id
    ? result.filterRange : undefined
})

/** Rust 返回完整隐藏索引，复用 viewport 的可见性投影，不压缩或重排源行号。 */
export const runNativeFilterAtom = atom(
  null,
  async (get, set, input: RustFilterAction | 'selection'): Promise<boolean> => {
    const action: RustFilterAction = input === 'selection'
      ? { action: 'apply', range: get(selectionSnapshotAtom).range, rules: [] } : input
    if (
      get(feedbackAtom).busy ||
      get(editingSessionAtom).source !== null ||
      get(rustHistoryPanelAtom).busy ||
      get(selectionStructureFeedbackAtom).busy ||
      get(sortFeedbackAtom).busy
    )
      return false
    const connection = get(rustWorkbookConnectionAtom)
    const sheet = get(activeWorkbookSheetAtom)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (!connection || !sheet || visible?.kind !== 'visible-window' || visible.sheetId !== sheet.id)
      return false
    const fail = (error: string) => {
      set(feedbackAtom, { busy: false, error, message: '' })
      return false
    }
    if (input === 'selection' && get(selectionRegionsAtom).length !== 1)
      return fail('Select one continuous filter range, including its header.')
    if (action.action === 'apply' && action.range && !validFilterRange(action.range))
      return fail('Select a header and at least one data row for the filter range.')
    if (getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected')
      return fail('Unprotect the worksheet before changing its filter.')
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: sheet.id,
      requestId,
      window: visible.window,
      viewport: visible.viewport,
      reason: 'toolbar',
    })
    const selection = get(selectionSnapshotAtom)
    const authority = get(selectionAuthorityWitnessAtom)
    const busy = { busy: true, error: '', message: 'Filtering…' }
    set(feedbackAtom, busy)
    try {
      const pending = connection.request('sheet.filter', {
        ...action,
        sheetId: sheet.id,
        projection,
      })
      await Promise.resolve()
      set(feedbackAtom, busy)
      const result = await pending
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      if (
        !validateProjectionResult(result.projection, { request: projection }).ok ||
        !validSheetVisibility(result.projection.visibility) ||
        !result.projection.filterRules
      )
        throw new Error('Rust returned a mismatched filter result.')
      const applied = set(applyVisibleProjectionAtom, {
        witness,
        request: projection,
        result: result.projection,
      })
      if (
        applied.status === 'applied' &&
        get(selectionAuthorityWitnessAtom) === authority &&
        selection.selection.sheetId === sheet.id
      ) {
        const heights = get(viewportGeometrySizesAtom).rowHeightsBySheet[sheet.id]
        let row = selection.activeCell.row
        while (row < sheet.rowCount && heights?.[row] === 0) row++
        if (row === sheet.rowCount) {
          row = selection.activeCell.row
          while (row > 0 && heights?.[row] === 0) row--
        }
        if (row !== selection.activeCell.row) {
          const coord = { ...selection.activeCell, row }
          set(selectCellAtom, { sheetId: sheet.id, coord })
          set(scrollToCellAtom, { coord })
        }
      }
      set(feedbackAtom, {
        busy: false,
        error: '',
        message:
          action.action === 'clear'
            ? 'Filter cleared. Manually hidden rows are unchanged.'
            : `${result.hiddenRows} rows filtered out.`,
      })
      return true
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    } finally {
      if (get(feedbackAtom).busy) set(feedbackAtom, { busy: false, error: '', message: '' })
    }
  },
)
