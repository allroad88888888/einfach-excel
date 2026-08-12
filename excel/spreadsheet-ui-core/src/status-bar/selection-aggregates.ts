import { atom } from '@einfach/core'
import type { Atom } from '@einfach/core'
import { selectionBoundsAtom, selectionRegionsAtom } from '../selection'
import {
  computeSelectionAggregatesFromRanges,
  normalizeSelectionRanges,
  rangeContains,
  type NormalizedSelectionRange,
} from './aggregates-compute'
import { statusBarProjectionSnapshotAtom, type StatusBarProjectionSnapshot } from './projection-state'
import type { SelectionAggregates } from './types'

/** Joins the projection snapshot with the live selection into one aggregate. */

function selectionCoverageIsTruncated(
  projection: StatusBarProjectionSnapshot,
  ranges: readonly NormalizedSelectionRange[],
): boolean {
  if (projection.upstreamTruncated || projection.cellsTruncated) return true
  if (ranges.length === 0) return false
  if (projection.sheetId === null || projection.window === null) return true

  for (const entry of ranges) {
    if (entry.sheetId !== projection.sheetId || !rangeContains(projection.window, entry.range)) {
      return true
    }
  }
  return false
}

export const selectionAggregatesAtom: Atom<SelectionAggregates> = atom((get) => {
  const projection = get(statusBarProjectionSnapshotAtom)
  const ranges = normalizeSelectionRanges(get(selectionRegionsAtom), get(selectionBoundsAtom))
  const matchingRanges =
    projection.sheetId === null
      ? []
      : ranges.filter((entry) => entry.sheetId === projection.sheetId).map((entry) => entry.range)
  return computeSelectionAggregatesFromRanges(projection.cells, matchingRanges, {
    truncated: selectionCoverageIsTruncated(projection, ranges),
  })
})
selectionAggregatesAtom.debugLabel = 'spreadsheet.statusBar.selectionAggregates'

/**
 * Read-only aggregate truth, including upstream/local cell truncation,
 * selection coverage, sheet mismatch, and membership-budget exhaustion.
 */
export const statusBarAggregateTruncatedAtom: Atom<boolean> = atom(
  (get) => get(selectionAggregatesAtom).truncated,
)
statusBarAggregateTruncatedAtom.debugLabel = 'spreadsheet.statusBar.aggregateTruncated'
