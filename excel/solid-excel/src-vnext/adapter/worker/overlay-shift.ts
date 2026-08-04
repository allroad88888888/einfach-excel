// 一句话：按 sheet 维护宿主 overlay 的丢弃与结构位移。

import { shiftMergeRangeList } from './merge-overlay'
import type { WorkerBackendState } from './state'

/**
 * Audit D-4: drop every per-sheet host overlay keyed by `sheetId`.
 * `syncSheetLookup` re-issues `sheet-${idx+1}` ids, so a deleted
 * sheet's id IS reused by the next added sheet — stale entries are not
 * just leaks, they get inherited. Per-sheet-keyed state in this
 * backend: `validationRulesBySheetId`, `conditionalFormatRulesBySheetId`,
 * `mergeRangesBySheetId`, `filterSortStateBySheetId`,
 * `filterHiddenRowsBySheetId`, and the sheet-scoped entries of
 * `namedRanges`.
 */
export function dropSheetOverlayState(
  state: WorkerBackendState,
  sheetId: string,
): void {
  state.validationRulesBySheetId.delete(sheetId)
  state.conditionalFormatRulesBySheetId.delete(sheetId)
  state.mergeRangesBySheetId.delete(sheetId)
  state.filterSortStateBySheetId.delete(sheetId)
  state.filterHiddenRowsBySheetId.delete(sheetId)
  state.namedRanges = state.namedRanges.filter(
    (item) => item.scope === 'workbook' || item.scope.sheetId !== sheetId,
  )
}

/**
 * W3 remap of the #04 merge overlay after an ACKed structural shift.
 * The engine has already displaced index space; the overlay's source
 * coordinates must follow or every merge south/east of the band would
 * render one band off.
 */
export function shiftMergeOverlay(
  state: WorkerBackendState,
  sheetId: string,
  axis: 'row' | 'column',
  index: number,
  count: number,
  direction: 1 | -1,
): void {
  const ranges = state.mergeRangesBySheetId.get(sheetId)
  if (!ranges || ranges.length === 0) return
  shiftMergeRangeList(ranges, axis, index, count, direction)
}

/**
 * Displace the FILTER-hidden MIRROR after an ACKed ROW shift, with the same
 * arithmetic the engine applies to its owned set (`Sheet::shift_filter_hidden_rows`)
 * and UI-core applies to `viewportFilterHiddenAtom`: on delete, rows inside
 * the band drop and rows past it move back; on insert, rows at or after the
 * point move forward. ROWS ONLY — a column edit displaces nothing in a row
 * set. Returns true when the sheet had a set to displace. There is NO re-push:
 * the engine self-displaced its own copy, so this only keeps the mirror (used
 * for withholding + the undo before/after images) in step.
 */
export function shiftFilterHiddenOverlay(
  state: WorkerBackendState,
  sheetId: string,
  index: number,
  count: number,
  direction: 1 | -1,
): boolean {
  const rows = state.filterHiddenRowsBySheetId.get(sheetId)
  if (!rows || rows.size === 0) return false
  const deleteEnd = index + count - 1
  const next = new Set<number>()
  for (const row of rows) {
    if (direction === 1) {
      next.add(row >= index ? row + count : row)
      continue
    }
    if (row >= index && row <= deleteEnd) continue
    next.add(row > deleteEnd ? row - count : row)
  }
  if (next.size === 0) state.filterHiddenRowsBySheetId.delete(sheetId)
  else state.filterHiddenRowsBySheetId.set(sheetId, next)
  return true
}
