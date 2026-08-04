// 一句话：整簿筛选快照的变化判定与容量闸门。

import type { FilterSnapshotWire } from '../worker-protocol'
import { WORKER_FILTER_SNAPSHOT_MAX } from './limits'

/**
 * True when one sheet's committed filter differs between two whole-workbook
 * `snapshotFilters` envelopes. `snapshot_filters` omits sheets with no
 * filter, so an apply (absent → present) and a clear (present → absent) both
 * register as a change; a re-apply of identical rules over unchanged data
 * (rules + derived hidden rows both equal) registers as none. The entries are
 * plain wire objects, so a structural stringify is an exact, order-stable
 * comparison (the engine emits rules and hidden rows deterministically).
 */
export function filterSnapshotSheetChanged(
  before: FilterSnapshotWire,
  after: FilterSnapshotWire,
  sheetIdx: number,
): boolean {
  const beforeEntry = before.filters.find((entry) => entry.sheet === sheetIdx) ?? null
  const afterEntry = after.filters.find((entry) => entry.sheet === sheetIdx) ?? null
  return JSON.stringify(beforeEntry) !== JSON.stringify(afterEntry)
}

/**
 * Sum of `hiddenRows.length` across every sheet entry in one whole-workbook
 * filter image — the element count `WORKER_FILTER_SNAPSHOT_MAX` bounds.
 */
export function filterSnapshotHiddenRowCount(snapshot: FilterSnapshotWire): number {
  let total = 0
  for (const entry of snapshot.filters) total += entry.hiddenRows.length
  return total
}

/**
 * The worst per-image hidden-row count when it EXCEEDS `WORKER_FILTER_SNAPSHOT_MAX`,
 * else null. Both `filtersSnapshot` producers — the structural side payload
 * (`recordStructuralMutation`) and the standalone `filter.set` record
 * (`setFilterSortThroughWorker`) — degrade to not-undoable when this returns
 * non-null, so the two paths share ONE gate. Per-image (before OR after)
 * against the cap, mirroring the structural cell cap, because the ×2 for
 * before + after is already folded into the 128 MiB / 200 derivation.
 */
export function filterSnapshotOverCap(
  before: FilterSnapshotWire,
  after: FilterSnapshotWire,
): number | null {
  const worst = Math.max(
    filterSnapshotHiddenRowCount(before),
    filterSnapshotHiddenRowCount(after),
  )
  return worst > WORKER_FILTER_SNAPSHOT_MAX ? worst : null
}
