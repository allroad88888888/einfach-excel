// 一句话：从 worker 引擎读取 Top/Bottom 规则完整范围的排名命中坐标。

import type {
  CellRange,
  ConditionalFormatRuleEntry,
  DisplayCell,
} from '@einfach/spreadsheet-ui-core'
import { collectTopBottomMatches, type TopBottomMatches } from '../top-bottom-projection'
import { rangesIntersect } from './range-overlap'
import { snapshotToDisplayCell } from './snapshot-to-cell'
import type { WorkerBackendState } from './state'
import { toSparseRange } from './wire-range'

/** A viewport chooses relevant rules; each selected rule reads its complete canonical scope. */
export async function readTopBottomMatches(
  state: WorkerBackendState,
  sheet: number,
  rules: readonly ConditionalFormatRuleEntry[],
  window: CellRange,
): Promise<TopBottomMatches> {
  const entries = rules.filter(
    (entry) => entry.rule.kind === 'top-bottom' && rangesIntersect(entry.scope.range, window),
  )
  const snapshots = await Promise.all(
    entries.map((entry) => state.client.readSparseRange(toSparseRange(sheet, entry.scope.range))),
  )
  const matches = new Map<string, ReadonlySet<string>>()

  snapshots.forEach((rangeSnapshots, index) => {
    const entry = entries[index]
    const entryMatches = collectTopBottomMatches(
      [entry],
      rangeSnapshots
        .map(snapshotToDisplayCell)
        .filter((cell): cell is DisplayCell => cell !== null),
    ).get(entry.id)
    if (entryMatches) matches.set(entry.id, entryMatches)
  })
  return matches
}
