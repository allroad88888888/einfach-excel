// 一句话：隐藏行/列集合的求值读取与结构位移。

import type { StaticBackendState } from './state'

export function shiftHiddenIndexSet(
  hiddenIndices: Set<number>,
  index: number,
  count: number,
  direction: 1 | -1,
): void {
  const next = new Set<number>()
  const deleteEnd = index + count - 1

  for (const hiddenIndex of hiddenIndices) {
    if (direction === -1 && hiddenIndex >= index && hiddenIndex <= deleteEnd) {
      continue
    }
    const nextIndex =
      hiddenIndex >= (direction === 1 ? index : deleteEnd + 1)
        ? hiddenIndex + count * direction
        : hiddenIndex
    if (nextIndex >= 0) next.add(nextIndex)
  }

  hiddenIndices.clear()
  for (const hiddenIndex of next) hiddenIndices.add(hiddenIndex)
}

/**
 * The row set SUBTOTAL 101-111 excludes on `sheetId` — this backend's manually
 * hidden rows (design-excel-table §6.1).
 *
 * SINGLE lane since the hidden-row sink-down (design-engine-hidden-rows §7.1,
 * E7): the eval-input `setEvalHiddenRows` no longer feeds a SEPARATE
 * `evalHiddenRowsBySheetId` map that was UNIONED in here. The host's
 * `eval-hidden-rows-bridge` was retired with E7 (the engine owns the manual
 * set through the `hideRows` / `unhideRows` ports and UI core reconciles from
 * the ACK), so the pushed lane had no production driver left; `setEvalHiddenRows`
 * now whole-set-REPLACES `hiddenRowsBySheetId` directly — the same store its
 * `hideRows` port mutates — exactly as the WASM engine's `set_eval_hidden_rows`
 * writes the one owned `Sheet::hidden_rows`. The static-only union that could
 * hold `hideRows` and a divergent push at once is gone with it.
 *
 * Filter-hidden rows are deliberately NOT merged in. Excel's rule
 * (`design-filter-hidden-rows` §2/§3) is that `SUBTOTAL(1-11)` excludes
 * FILTER-hidden rows but INCLUDES manually hidden ones, while 101-111 excludes
 * both — merging the two destroys the source information that rule is stated
 * in. The filter side lives in `filterHiddenRowsForSheet` below and the engine
 * keeps them apart the same way (`eval_hidden_rows` vs `eval_filter_hidden_rows`).
 */
export function evalHiddenRowsForSheet(
  state: StaticBackendState,
  sheetId: string,
): ReadonlySet<number> | undefined {
  return state.hiddenRowsBySheetId.get(sheetId)
}

/**
 * The row set an ACTIVE FILTER hides on `sheetId` — excluded by BOTH SUBTOTAL
 * bands (`design-filter-hidden-rows` §6.3), which is what distinguishes it
 * from `evalHiddenRowsForSheet` above.
 *
 * Single lane by construction: this backend computes the set itself in
 * `setFilterSort` (it owns the cell values the predicate reads), so there is
 * no host-pushed second source to union with. The worker adapter reaches the
 * same engine state by pushing `setEvalFilterHiddenRows` instead — same fact,
 * same snapshot point, different transport.
 */
export function filterHiddenRowsForSheet(
  state: StaticBackendState,
  sheetId: string,
): ReadonlySet<number> | undefined {
  const rows = state.filterHiddenRowsBySheetId.get(sheetId)
  return rows?.size ? rows : undefined
}

/**
 * W3 remap of the FILTER-hidden snapshot after a ROW insert/delete (S5a).
 *
 * Same displacement as the manual twin two call sites up (`shiftHiddenIndexSet`
 * on `hiddenRowsBySheetId`) and for the same reason: since the S5 flip this set
 * is a SNAPSHOT, not a per-revision rederivation, so an unshifted index would
 * withhold a row the filter never judged — and, because this backend also feeds
 * the set to its evaluator as `filterHiddenRows`, make SUBTOTAL exclude it too.
 *
 * ROWS ONLY: a column insert/delete displaces nothing in a row set.
 */
export function shiftFilterHiddenRows(
  state: StaticBackendState,
  sheetId: string,
  rowIndex: number,
  count: number,
  direction: 1 | -1,
): void {
  const rows = state.filterHiddenRowsBySheetId.get(sheetId)
  if (!rows || rows.size === 0) return
  shiftHiddenIndexSet(rows, rowIndex, count, direction)
  if (rows.size === 0) state.filterHiddenRowsBySheetId.delete(sheetId)
}
