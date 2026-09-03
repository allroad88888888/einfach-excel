// 一句话：从 worker 引擎读取 Data Bar 规则完整范围的数值域。

import type {
  CellRange,
  ConditionalFormatRuleEntry,
  DisplayCell,
} from '../../../index'
import { collectDataBarDomains, type DataBarDomains } from '../data-bar-projection'
import { rangesIntersect } from './range-overlap'
import { snapshotToDisplayCell } from './snapshot-to-cell'
import type { WorkerBackendState } from './state'
import { toSparseRange } from './wire-range'

/** A viewport chooses relevant rules; each selected rule reads its complete canonical scope. */
export async function readDataBarDomains(
  state: WorkerBackendState,
  sheet: number,
  rules: readonly ConditionalFormatRuleEntry[],
  window: CellRange,
): Promise<DataBarDomains> {
  const entries = rules.filter(
    (entry) => entry.rule.kind === 'data-bar' && rangesIntersect(entry.scope.range, window),
  )
  const snapshots = await Promise.all(
    entries.map((entry) => state.client.readSparseRange(toSparseRange(sheet, entry.scope.range))),
  )
  const domains = new Map<string, { min: number; max: number }>()

  snapshots.forEach((rangeSnapshots, index) => {
    const entry = entries[index]
    const domain = collectDataBarDomains(
      [entry],
      rangeSnapshots
        .map(snapshotToDisplayCell)
        .filter((cell): cell is DisplayCell => cell !== null),
    ).get(entry.id)
    if (domain) domains.set(entry.id, domain)
  })
  return domains
}
