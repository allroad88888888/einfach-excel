import type { SortDirection } from '../filter-sort/types'
import type { CellRange, SheetRef } from '../shared'
import type { BackendMutationResult } from './mutation-results'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** Rust 物理排序与筛选命令的数据契约。 */
// --- filter-sort ---
export type { SetFilterSortRequest } from '../filter-sort/types'

// --- engine physical sort (sortRange) — design-engine-sort ---

/**
 * One physical-sort key. `col` is a 0-based ABSOLUTE column index that
 * MUST fall inside the sort range's column span. `direction` defaults to
 * `'asc'` and `caseSensitive` to `false` (Excel defaults) when omitted.
 */
export interface SortRangeKey {
  col: number
  direction?: SortDirection
  caseSensitive?: boolean
}

/**
 * Engine physical sort request (parity #29 — sort execution is an engine
 * DATA fact, not a UI display permutation). The visible rows inside
 * `range` are stably reordered by `keys` while `excludedRows` (0-based
 * SOURCE rows the host assembles from hidden ∪ filtered-out ∪ summary
 * rows) stay in place. The adapter de-dupes `excludedRows` and clips
 * them to the range; entries outside it are ignored.
 */
export interface SortRangeRequest extends SheetRef {
  kind: 'sort-range'
  range: CellRange
  keys: readonly SortRangeKey[]
  excludedRows?: readonly number[]
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

/**
 * Applied witness for a physical sort. `movedRows` / `movedCells` count
 * the change (`0` on a no-op sort, which still resolves applied and bumps
 * the revision). `affectedRange` echoes the sorted range. `rowPermutation`
 * is `[[slotRow, sourceRow], …]` over the CHANGED slots only — reserved
 * for overlay remap / parity; v1 consumers may ignore it.
 */
export interface SortRangeAppliedResult extends SheetRef {
  kind: 'sort-range'
  applied: true
  movedRows: number
  movedCells: number
  affectedRange: CellRange
  rowPermutation?: ReadonlyArray<readonly [number, number]>
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

/**
 * Structured reject reasons a physical sort surfaces BEFORE writing any
 * data. The first five mirror the engine gates; `source-too-large` and
 * `merge-in-range` are the adapter's own pre-dispatch authority gates
 * (source-size cap and merge registry — the engine models neither).
 */
export type SortRangeRejectionCode =
  | 'invalid-range'
  | 'empty-keys'
  | 'key-out-of-range'
  | 'spill-in-range'
  | 'invalid-payload'
  | 'source-too-large'
  | 'merge-in-range'

/**
 * Contract-level evidence that a physical sort was rejected before
 * application — nothing was written, no undo entry recorded, and
 * `revision` is the current (un-bumped) witness. Generic promise
 * rejection is deliberately NOT equivalent to this result.
 */
export interface SortRangeRejectedResult extends SheetRef {
  kind: 'sort-range-not-applied'
  applied: false
  code: SortRangeRejectionCode
  /** Present only for `spill-in-range` — the intersecting anchor (A1). */
  anchor?: string
  message?: string
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export type SortRangeResult = SortRangeAppliedResult | SortRangeRejectedResult

/** 筛选提交后返回完整的隐藏行快照。 */
export interface SetFilterSortResult extends BackendMutationResult {
  hiddenRowIndices?: readonly number[]
  /** `true` 表示 Rust 为此次变更记录了一条可撤销事务。 */
  historyRecorded?: boolean
}
