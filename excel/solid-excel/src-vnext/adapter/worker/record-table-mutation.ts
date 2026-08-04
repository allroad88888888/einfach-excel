// 一句话：把一次 Table 定义变更录成一条可撤销事务。

import type { SparseCellWire, SparseRangeWire, TableRegistrySnapshotWire } from '../worker-protocol'
import { requireTableClient } from './table-client'
import type { TableImageScope } from './table-image'
import { captureTableCellImage, tableImageCap, totalsBandRange } from './table-image'
import { notUndoableRecord, pushTransactionRecord } from './transaction-log'
import type { WorkerBackendState } from './state'

/**
 * Record one undoable Table-DEFINITION mutation (#25).
 *
 * The E1 hazard this exists to close: `snapshotTables` alone rolls the
 * registry back while the cells it implies stay put — a totals toggle
 * would leave `SUBTOTAL` formulas sitting under a table that no longer
 * claims a totals row, and a rename would leave rewritten formula TEXT
 * pointing at a name that no longer exists. So the registry envelope and
 * the cell image are captured, stored, and replayed as ONE transaction;
 * there is no code path that carries only one of them.
 *
 * `spec.scope` sizes the cell half to what the operation can touch (#26 —
 * see `WORKER_TABLE_FORMULA_SNAPSHOT_MAX` for the per-port engine
 * verification). The registry envelope is always full: it is one small
 * array of table descriptors, so there is nothing to scope down.
 *
 * Formats are deliberately NOT captured: no table binding touches the
 * format layer (the engine writes values/formulas only, and `clearRange`
 * is values-only), same reasoning as `recordStructuralMutation`.
 *
 * A structured engine reject records NOTHING — table mutations are
 * all-or-nothing, so a not-applied result changed neither registry nor
 * cells, and UI-core pushes no history entry for it either. An applied
 * mutation ALWAYS records, including an idempotent no-op toggle: the
 * host stack must stay aligned entry-for-entry, and replaying an
 * identity image is harmless.
 *
 * REQUIRED UI-CORE COUNTERPART — `excel/spreadsheet-ui-core/src/tables/
 * commands.ts` must `set(pushHistoryAtom, …)` on every APPLIED table
 * mutation. Adapter records align POSITIONALLY with UI-core history
 * entries (`runHistoryTransaction` pops the top record and binds whatever
 * transactionId arrives), so a record pushed here without a matching
 * UI-core entry offsets the two stacks by one: every later Ctrl+Z reverts
 * a mutation one step older than the UI believes, and the oldest record
 * strands when UI-core's stack empties first. Measured on the vNext Worker
 * demo: seed six cells, create a table, then Ctrl+Z three times — the
 * table reverts on the first press but `F3` only clears on the third.
 * The registry half of this feature is not safe to ship until that push
 * lands.
 */
export async function recordTableMutation<T extends { applied: boolean }>(
  state: WorkerBackendState,
  spec: {
  /** Sizes the cell image; see `TableImageScope`. */
  scope: TableImageScope
  /** Known up front only for `createTable`; the rest key off a table NAME. */
  sheetIdx?: number
  /**
   * Anchor-sheet resolution for the name-keyed ports, and the geometry
   * source for the `'totals-band'` scope: both read off the before-image
   * registry, so they cost no extra RPC. The anchor index is record
   * metadata, never a replay input.
   */
  tableName?: string
  execute: () => Promise<T>
}): Promise<T> {
  let registryBefore: TableRegistrySnapshotWire | null = null
  let before: { cells: SparseCellWire[] | null } | null = null
  let band: SparseRangeWire | null = null
  let diagnostic = ''
  try {
    registryBefore = await requireTableClient(state, 'snapshotTables')()
    const entry = registryBefore.tables.find(
      (candidate) => candidate.name.toUpperCase() === (spec.tableName ?? '').toUpperCase(),
    )
    band = spec.scope === 'totals-band' ? totalsBandRange(entry) : null
    if (spec.scope === 'totals-band' && band === null) {
      diagnostic =
        'table totals-row geometry could not be resolved from the registry; ' +
        'the operation is not undoable'
    } else {
      before = await captureTableCellImage(state, spec.scope, band)
      if (before === null) {
        diagnostic =
          `table before-image exceeds the ${spec.scope} cap of ` +
          `${tableImageCap(spec.scope)} cells; the operation is not undoable`
      }
    }
  } catch (error) {
    before = null
    diagnostic = `table undo before-image snapshot failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
  const anchored =
    spec.sheetIdx ??
    registryBefore?.tables.find(
      (entry) => entry.name.toUpperCase() === (spec.tableName ?? '').toUpperCase(),
    )?.sheetIndex ??
    0
  const result = await spec.execute()
  if (!result.applied) return result
  if (registryBefore === null || before === null) {
    pushTransactionRecord(state, notUndoableRecord('table.define', anchored, null, diagnostic))
    return result
  }
  let registryAfter: TableRegistrySnapshotWire | null = null
  let after: { cells: SparseCellWire[] | null } | null = null
  try {
    registryAfter = await requireTableClient(state, 'snapshotTables')()
    after = await captureTableCellImage(state, spec.scope, band)
    if (after === null) {
      diagnostic =
        `table after-image exceeds the ${spec.scope} cap of ` +
        `${tableImageCap(spec.scope)} cells; the operation degraded to not-undoable`
    }
  } catch (error) {
    after = null
    diagnostic = `table redo after-image snapshot failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
  pushTransactionRecord(state, 
    after !== null && registryAfter !== null
      ? {
          kind: 'table.define',
          sheetIdx: anchored,
          boundTransactionId: null,
          affectedRange: null,
          clearRange: null,
          // Clear-then-restore is needed only where the operation can
          // ADD or REMOVE a cell — the totals band. A rename rewrites
          // formulas in place, so an additive `restoreSparse` of the
          // formula image is exact and a workbook-wide pre-clear would
          // only put every literal in the workbook at risk.
          clearRanges: band !== null ? [band] : [],
          before: { cells: before.cells, format: null },
          after: { cells: after.cells, format: null },
          tableRegistry: { before: registryBefore, after: registryAfter },
        }
      : notUndoableRecord('table.define', anchored, null, diagnostic),
  )
  return result
}
