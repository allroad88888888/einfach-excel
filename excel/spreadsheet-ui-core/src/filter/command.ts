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
import {
  selectCellAtom,
  selectionSnapshotAtom,
  selectionAuthorityWitnessAtom,
  selectionRegionsAtom,
} from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'
import { changeNativeTableAtom } from '../tables/native-change'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import { nativeTableFiltersAtom } from './scope'

export { nativeFilterRulesAtom, nativeFilterRangeAtom } from './scope'
type FilterAction = RustFilterAction & { readonly table?: string }

const feedbackAtom = atom({ busy: false, error: '', message: '' })
export const nativeFilterFeedbackAtom = atom((get) => ({
  ...get(feedbackAtom),
  busy: get(feedbackAtom).busy || get(nativeTableFeedbackAtom).busy,
}))

/** Rust 返回完整隐藏索引，复用 viewport 的可见性投影，不压缩或重排源行号。 */
export const runNativeFilterAtom = atom(
  null,
  async (get, set, input: FilterAction | 'selection'): Promise<boolean> => {
    const action: FilterAction =
      input === 'selection'
        ? { action: 'apply', range: get(selectionSnapshotAtom).range, rules: [] }
        : input
    if (
      get(feedbackAtom).busy ||
      get(nativeTableFeedbackAtom).busy ||
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
    const tableTarget = action.table === undefined ? undefined
      : get(nativeTableFiltersAtom).find((table) => table.table === action.table)
    if (action.table !== undefined && !tableTarget)
      return fail('The table changed. Close and reopen Filter.')
    if (
      !action.table &&
      action.action === 'apply' &&
      action.range &&
      !validFilterRange(action.range)
    )
      return fail('Select a header and at least one data row for the filter range.')
    if (getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected')
      return fail('Unprotect the worksheet before changing its filter.')
    const selection = get(selectionSnapshotAtom)
    const authority = get(selectionAuthorityWitnessAtom)
    const busy = { busy: true, error: '', message: 'Filtering…' }
    set(feedbackAtom, busy)
    try {
      let applied: boolean
      let hiddenRows: number
      if (action.table) {
        const projection = await set(
          changeNativeTableAtom,
          action.action === 'apply'
            ? { kind: 'filter', name: action.table, rules: action.rules }
            : {
                kind: action.action === 'clear' ? 'clear-filter' : 'reapply-filter',
                name: action.table,
              },
        )
        if (get(rustWorkbookConnectionAtom) !== connection ||
          get(activeWorkbookSheetAtom)?.id !== sheet.id) return false
        if (!projection)
          throw new Error(get(nativeTableFeedbackAtom).error ?? 'The table filter was not applied.')
        applied = true
        hiddenRows = projection.visibility!.filterRows.length
      } else {
        const requestId = set(issueProjectionRequestIdAtom)
        if (requestId === null) return false
        const projection = createVisibleProjectionRequest({
          sheetId: sheet.id,
          requestId,
          window: visible.window,
          viewport: visible.viewport,
          reason: 'toolbar',
        })
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
        applied =
          set(applyVisibleProjectionAtom, {
            witness,
            request: projection,
            result: result.projection,
          }).status === 'applied'
        hiddenRows = result.hiddenRows
      }
      if (
        applied &&
        get(selectionAuthorityWitnessAtom) === authority &&
        selection.selection.sheetId === sheet.id
      ) {
        const heights = get(viewportGeometrySizesAtom).rowHeightsBySheet[sheet.id]
        const activeRow = selection.activeCell.row
        const withinTable = tableTarget && activeRow >= tableTarget.range.rowStart &&
          activeRow <= tableTarget.range.rowEnd
        const first = withinTable ? tableTarget.range.rowStart : 0
        const last = withinTable ? tableTarget.range.rowEnd : sheet.rowCount - 1
        const row = visibleRowNear(activeRow, first, last, heights) ?? (withinTable
          ? visibleRowNear(activeRow, 0, sheet.rowCount - 1, heights) : undefined)
        if (row !== undefined && row !== activeRow) {
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
            ? `${action.table ? `Table ${action.table} filter` : 'Filter'} cleared. Manually hidden rows are unchanged.`
            : action.table ? `Table ${action.table}. ${hiddenRows} rows filtered out in this worksheet.`
              : `${hiddenRows} rows filtered out.`,
      })
      return true
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    } finally {
      if (get(feedbackAtom).busy) set(feedbackAtom, { busy: false, error: '', message: '' })
    }
  },
)

/** 优先向下，再向上；多个作用域把整张 Table 隐藏时，由调用方退回工作表范围。 */
function visibleRowNear(start: number, first: number, last: number,
  heights: Readonly<Record<number, number>> | undefined): number | undefined {
  for (let row = start; row <= last; row++) if (heights?.[row] !== 0) return row
  for (let row = start - 1; row >= first; row--) if (heights?.[row] !== 0) return row
  return undefined
}
