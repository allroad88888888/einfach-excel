// 一句话：宿主编排的撤销事务记录结构。

import type { CellRange, HistoryEntryKind } from '@einfach/spreadsheet-ui-core'
import type {
  FilterSnapshotWire,
  FormatRangeSnapshot,
  SparseCellWire,
  SparseRangeWire,
  TableRegistrySnapshotWire,
} from '../worker-protocol'

export interface WorkerUndoImage {
  /** Sparse cells to restore; null when the mutation cannot touch values. */
  cells: SparseCellWire[] | null
  /** Format snapshot to restore; null when the mutation cannot touch formats. */
  format: FormatRangeSnapshot | null
}

/**
 * Parity #25 Table-definition transaction payload: before/after images of
 * the whole Table REGISTRY, replayed through `restoreTables` (REPLACE
 * semantics, so an empty `tables` array clears the registry). Rides on the
 * SAME record as the transaction's workbook-wide cell image — the pairing is
 * the point, see `recordTableMutation`.
 */
interface WorkerTableRegistryImage {
  before: TableRegistrySnapshotWire
  after: TableRegistrySnapshotWire
}

/**
 * Parity #04 merge-overlay transaction payload: before/after images of
 * ONE sheet's merge-range set. Replay is a pure adapter-memory swap —
 * no engine RPC, and clear-then-restore does not apply (the record set
 * is replaced wholesale).
 */
interface WorkerMergeOverlayImage {
  sheetId: string
  before: CellRange[]
  after: CellRange[]
}

/**
 * Pre/post whole-workbook FILTER snapshots (rules + derived hidden rows),
 * carried by a structural record that mutated a sheet with an active filter
 * (E8 undo reroute). The engine self-shifts its OWNED filter on the structural
 * op; the cell-level undo replay does NOT structurally re-shift it, so undo
 * REPLACES the engine filter back to the recorded before-image through
 * `restoreFilters` — the engine's own snapshot primitive, the same
 * REPLACE-semantics twin of `restoreTables`. This SUPERSEDES the E7 pair of an
 * adapter-memory before/after array plus a `setEvalFilterHiddenRows` re-push:
 * `restoreFilters` restores rules AND hidden rows atomically, and inverting a
 * delete that consumed filter-hidden rows has no inverse — which is exactly
 * why a full before-image, not a remap, is what undo needs.
 */
interface WorkerFilterSnapshotImage {
  /** Adapter sheetId whose withholding mirror the restore re-syncs. */
  sheetId: string
  /** Engine sheet index the mirror re-sync reads out of the snapshot. */
  sheetIdx: number
  before: FilterSnapshotWire
  after: FilterSnapshotWire
}

export interface WorkerTransactionRecord {
  /**
   * `'table.define'` is adapter-local (#25): UI-core's `HistoryEntryKind`
   * has no Table member yet, and the field is inert on the replay path — it
   * exists so a diagnostic names the transaction truthfully instead of
   * borrowing an unrelated kind.
   */
  kind: HistoryEntryKind | 'table.define'
  sheetIdx: number
  /**
   * The UI transaction id is minted AFTER the mutation acknowledges
   * (`nextHistoryTransactionId()` at push time), so the adapter cannot
   * key records by it up front. Records align positionally with UI-core
   * backend entries (static-backend precedent) and the id binds lazily
   * on the first successful undo; later undo/redo of the same record
   * must present the bound id or the request answers not-applied.
   */
  boundTransactionId: string | null
  affectedRange: CellRange | null
  /** Region cleared before restoring `cells` (clear-then-restore, design point A). */
  clearRange: SparseRangeWire | null
  /**
   * Multi-sheet clear list for WORKBOOK-WIDE images (#25 Table
   * definitions). `clearRange` addresses one sheet, which cannot express
   * "clear every sheet before restoring the workbook image"; when this is
   * present it REPLACES `clearRange` on the replay path.
   */
  clearRanges?: SparseRangeWire[]
  /** null before/after → the record is not undoable; see `diagnostic`. */
  before: WorkerUndoImage | null
  after: WorkerUndoImage | null
  /**
   * Present when the mutation touched the #04 merge overlay. Merge /
   * unmerge records carry ONLY this payload (before/after stay null);
   * structural records carry it as a side payload next to their sparse
   * engine images so undo restores the pre-shift merge set too.
   */
  mergeOverlay?: WorkerMergeOverlayImage
  /**
   * Present when a structural mutation displaced a sheet that had an active
   * FILTER (E8). Rides next to the sparse engine images exactly like
   * `mergeOverlay`, and is replayed after them through the engine's
   * `restoreFilters` snapshot primitive.
   */
  filtersSnapshot?: WorkerFilterSnapshotImage
  /**
   * Present when the mutation changed the Excel Table REGISTRY (#25).
   * Always carried NEXT TO the sparse cell images, never alone: replaying
   * the registry without the cells (or vice versa) is exactly the
   * "geometry rolled back but the totals cells are still there" half-state.
   */
  tableRegistry?: WorkerTableRegistryImage
  diagnostic?: string
}
