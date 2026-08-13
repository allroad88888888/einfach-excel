// 一句话：从 worker 引擎读取 Color Scale 规则完整范围的数值域。

import type {
  CellRange,
  ConditionalFormatRuleEntry,
  DisplayCell,
} from '@einfach/spreadsheet-ui-core'
import { collectColorScaleDomains, type ColorScaleDomains } from '../color-scale-projection'
import { rangesIntersect } from './range-overlap'
import { snapshotToDisplayCell } from './snapshot-to-cell'
import { toSparseRange } from './wire-range'
import type { WorkerBackendState } from './state'

/**
 * A viewport only asks for domains of rules that could paint it, but every
 * selected rule reads its entire configured scope from the canonical engine.
 */
export async function readColorScaleDomains(
  state: WorkerBackendState,
  sheet: number,
  rules: readonly ConditionalFormatRuleEntry[],
  window: CellRange,
): Promise<ColorScaleDomains> {
  const entries = rules.filter(
    (entry) => entry.rule.kind === 'color-scale' && rangesIntersect(entry.scope.range, window),
  )
  const snapshots = await Promise.all(
    entries.map((entry) => state.client.readSparseRange(toSparseRange(sheet, entry.scope.range))),
  )
  const domains = new Map<string, { min: number; max: number }>()

  snapshots.forEach((rangeSnapshots, index) => {
    const entry = entries[index]
    const domain = collectColorScaleDomains(
      [entry],
      rangeSnapshots
        .map(snapshotToDisplayCell)
        .filter((cell): cell is DisplayCell => cell !== null),
    ).get(entry.id)
    if (domain) domains.set(entry.id, domain)
  })
  return domains
}
