// 一句话：筛选与排序端口。

import type { SetFilterSortRequest, SortRangeRequest } from '@einfach/spreadsheet-ui-core'
import { runtimeSupports } from '../capabilities'
import { setFilterSortThroughWorker } from '../filter-sort'
import { sortRangeThroughWorker } from '../sort'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createFilterSortPorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'setFilterSort' | 'sortRange'> {
  const setFilterSort = (request: SetFilterSortRequest) =>
    setFilterSortThroughWorker(state, request)
  const sortRange = (request: SortRangeRequest) => sortRangeThroughWorker(state, request)

  return {
    /**
     * Parity item #29 — filter VISIBILITY on the worker path, routed through
     * the engine since E5. The rules stay ui-core canonical (this ACK is what
     * lets ui-core commit them); the adapter forwards them to `applyFilter`,
     * which runs the predicate ONCE inside the engine and commits both the rules
     * and the rows they hid. The returned `hiddenRows` IS the answer — the same
     * host scan that used to compute it here is gone (the engine reproduced it
     * cell-for-cell, verified at E3 over 7700 predicate judgments), and so is
     * the separate eval-input push (the engine owns the set now, its
     * `filter_hidden_epoch` bump re-derives SUBTOTAL on the normal `cellsDirty`
     * path). An over-cap source rejects with `source-too-large`, mapped to the
     * legacy `FILTER_SORT_SOURCE_TOO_LARGE` host error so ui-core's over-cap
     * handling is unchanged — the filter never activates, fail-closed, no silent
     * truncation. Clearing (a no-effect payload) calls `clearFilter` (scan-free,
     * always succeeds), so an over-cap state can always be exited.
     *
     * The port is capability-gated by `engineHiddenState`: the TS runtime
     * declares it `false` (no engine predicate), so this getter reads
     * `undefined` and ui-core hides the filter entry — fail-closed, never a fake
     * scan the TS core cannot do.
     */
    get setFilterSort() {
      return runtimeSupports(state, 'engineHiddenState') ? setFilterSort : undefined
    },

    /**
     * Engine physical sort (design-engine-sort S4). Capability-gated: a
     * runtime that declares `sortRange: false` (the TS worker, which has
     * no physical sort) makes this port read `undefined` so UI-core hides
     * the physical-sort entry; the WASM runtime's null witness keeps it
     * exposed (full trust). See `sortRangeThroughWorker` for the cap +
     * merge gates and the host-orchestrated undo wrapping.
     */
    get sortRange() {
      return runtimeSupports(state, 'sortRange') ? sortRange : undefined
    },
  }
}
