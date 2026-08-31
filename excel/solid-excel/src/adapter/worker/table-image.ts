// 一句话：按操作范围取 Table 事务的单元格前后像。

import type { SparseCellWire, SparseRangeWire, TableJSONWire } from '../worker-protocol'
import {
  FULL_SHEET_INDEX_BOUND,
  WORKER_TABLE_FORMULA_SNAPSHOT_MAX,
  WORKER_TABLE_TOTALS_SNAPSHOT_MAX,
} from './limits'
import { parseA1 } from './wire-range'
import type { WorkerBackendState } from './state'

/**
 * Per-operation cell-image scope for a #25 Table transaction. See
 * `WORKER_TABLE_FORMULA_SNAPSHOT_MAX` for the engine-source verification
 * behind each member.
 */
export type TableImageScope = 'registry-only' | 'formula-rewrite' | 'totals-band'

/**
 * The two candidate totals rows of `entry` — `range.end.row` (a totals row
 * already in the geometry, which a disable or a `setTableTotalFunction`
 * writes) and `range.end.row + 1` (where an enable puts the new one) —
 * across the table's own column span on its anchor sheet. Derived from the
 * BEFORE geometry and reused for the after-image so clear-then-restore is
 * symmetric even though the toggle grows or shrinks the range by a row.
 */
export function totalsBandRange(entry: TableJSONWire | undefined): SparseRangeWire | null {
  if (!entry) return null
  const [startRaw, endRaw] = entry.range.split(':')
  const start = parseA1(startRaw ?? '')
  const end = parseA1(endRaw ?? startRaw ?? '')
  if (start === null || end === null) return null
  const lastRow = Math.max(start.row, end.row)
  return {
    sheet: entry.sheetIndex,
    startRow: lastRow,
    startCol: Math.min(start.col, end.col),
    endRow: Math.min(lastRow + 1, FULL_SHEET_INDEX_BOUND),
    endCol: Math.max(start.col, end.col),
  }
}

export function tableImageCap(scope: TableImageScope): number {
  return scope === 'totals-band'
    ? WORKER_TABLE_TOTALS_SNAPSHOT_MAX
    : WORKER_TABLE_FORMULA_SNAPSHOT_MAX
}

/**
 * Cell half of a Table-definition transaction, sized to what the operation
 * can actually touch. The outer `null` means the image blew its cap — the
 * caller degrades the record rather than storing a half-transaction. The
 * inner `cells: null` means the operation provably touches NO cell input
 * (registry-only ports), which is a fully undoable record, not a
 * degradation: `replayUndoImage` skips the cell leg and the registry
 * envelope carries the whole transaction.
 */
export async function captureTableCellImage(
  state: WorkerBackendState,
  scope: TableImageScope,
  band: SparseRangeWire | null,
): Promise<{ cells: SparseCellWire[] | null } | null> {
  if (scope === 'registry-only') return { cells: null }
  if (scope === 'totals-band') {
    if (band === null) return null
    const cells = await state.client.snapshotRangeSparse(band)
    return cells.length > WORKER_TABLE_TOTALS_SNAPSHOT_MAX ? null : { cells }
  }
  // Workbook-wide sweep, FORMULA cells only: a structured-reference
  // rewrite can only ever touch a cell that already holds a formula.
  const cells = (await state.client.snapshotSparse()).filter((cell) => cell.kind === 'formula')
  return cells.length > WORKER_TABLE_FORMULA_SNAPSHOT_MAX ? null : { cells }
}
