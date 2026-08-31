// 一句话：按记录回放一次撤销或重做。

import type {
  ColumnFilterRule,
  HistoryTransactionResult,
  RedoTransactionRequest,
  UndoTransactionRequest,
} from '@einfach/spreadsheet-ui-core'
import { cloneFilterSortState, cloneRange } from '@einfach/spreadsheet-ui-core'
import { throwAutoFillHistoryOutcomeUnknown } from './auto-fill-outcome'
import { createBackendError } from './backend-error'
import { flushDeferredAutoFillContentChange, runAutoFillNativeMutation } from './content-change'
import { bumpRevision } from './revision'
import { requireFilterClient, requireTableClient } from './table-client'
import type { WorkerTransactionRecord, WorkerUndoImage } from './transaction-record'
import type { WorkerBackendState } from './state'

export function historyNotApplied(
  state: WorkerBackendState,
  request: UndoTransactionRequest | RedoTransactionRequest,
  reason: string,
): HistoryTransactionResult {
  return {
    transactionId: request.transactionId,
    requestId: request.requestId,
    revision: state.revision,
    applied: false,
    notAppliedReason: reason,
  }
}

export async function replayUndoImage(
  state: WorkerBackendState,
  record: WorkerTransactionRecord,
  image: WorkerUndoImage,
): Promise<void> {
  // Design point A: restoreSparse is an ADDITIVE merge, so any region the
  // mutation could have EMPTIED must be cleared first or a delete /
  // overwrite undo leaves residue behind. An empty clear list is not
  // "nothing to replay" — it means the mutation only ever rewrote cells
  // in place (#26 table rename), where the additive merge is already
  // exact and a pre-clear would destroy cells outside the image.
  const clearRanges =
    record.clearRanges ?? (record.clearRange !== null ? [record.clearRange] : [])
  if (image.cells !== null) {
    for (const range of clearRanges) {
      await state.client.clearRange(range)
    }
    if (image.cells.length > 0) {
      await state.client.restoreSparse(image.cells)
    }
  }
  // restore_format_range_snapshot REPLACES per-cell formats inside the
  // snapshot range and the whole range-layer list — self-clearing, no
  // pre-clear needed.
  if (image.format !== null) {
    await state.client.restoreFormatSnapshot(image.format)
  }
}

/**
 * Design point C: no strict revision precondition — engine-initiated
 * revision bumps (async custom-formula settles) between the recorded
 * mutation and its undo are legal, so `request.revision` is never
 * compared against the adapter's counter. The acknowledgement carries
 * the ACTUAL post-replay revision, which UI-core commits as the new
 * witness. Unknown transactionId / missing snapshot answer a
 * structured not-applied instead of a fake success or a bare throw.
 */
export async function runHistoryTransaction(
  state: WorkerBackendState,
  action: 'undo' | 'redo',
  request: UndoTransactionRequest | RedoTransactionRequest,
): Promise<HistoryTransactionResult> {
  await state.readyPromise
  const source = action === 'undo' ? state.undoRecords : state.redoRecords
  const target = action === 'undo' ? state.redoRecords : state.undoRecords
  const record = source[source.length - 1]
  if (!record) {
    return historyNotApplied(state, request, `no recorded backend transaction to ${action}`)
  }
  if (record.boundTransactionId !== null && record.boundTransactionId !== request.transactionId) {
    return historyNotApplied(state, request, `unknown transactionId: ${request.transactionId}`)
  }
  if (
    (record.before === null || record.after === null) &&
    !record.mergeOverlay &&
    !record.filtersSnapshot
  ) {
    // A payload-only record is still undoable: merge/unmerge carry only their
    // overlay, and a filter apply/clear carries only its `filtersSnapshot`
    // (no cells changed). Only a record with neither cell images nor a
    // payload is genuinely not-undoable.
    return historyNotApplied(state, 
      request,
      record.diagnostic ?? 'transaction was recorded as not undoable',
    )
  }
  if (record.tableRegistry) {
    // #25 REPLAY ORDER — registry FIRST, then cells.
    //
    // MEASURED, not assumed: both orders were driven against the real
    // engine for create-undo, delete-undo, rename-undo and totals-off-undo
    // (including the sharp case where the restored `SUBTOTAL` lands in a
    // totals row whose `Table[Col]` #Data band must EXCLUDE it), and every
    // pair agreed. Structured-reference resolution is epoch-LAZY: a
    // formula installed by `restoreSparse` while its table is absent or
    // still carries the other name re-derives on the epoch bump
    // `restoreTables` fires, so neither order can strand a `#NAME?` or a
    // self-referencing band today.
    //
    // Registry-first is chosen because it is the order that stays correct
    // if that ever changes — it is the only one that guarantees the
    // registry a formula is interpreted against is already the restored
    // one at install time — and because it spends one fewer full recompute
    // over a stale registry. The test
    // "undo replays the registry before the cells" pins the sequence so a
    // refactor cannot silently swap it back.
    const snapshot = action === 'undo' ? record.tableRegistry.before : record.tableRegistry.after
    await requireTableClient(state, 'restoreTables')(snapshot)
  }
  if (record.before !== null && record.after !== null) {
    const image = action === 'undo' ? record.before : record.after
    // Replay failures propagate as thrown errors: the workbook may be
    // half-restored, which is exactly the outcome-unknown lane.
    if (record.kind === 'range.fill') {
      if (record.clearRange === null) {
        throw createBackendError(
          'INVALID_HISTORY_RECORD',
          'auto-fill history replay requires an exact clear range',
        )
      }
      try {
        await runAutoFillNativeMutation(state, record.clearRange, () =>
          replayUndoImage(state, record, image),
        )
      } catch (error) {
        throwAutoFillHistoryOutcomeUnknown(state, action, error)
      }
    } else {
      await replayUndoImage(state, record, image)
    }
  }
  if (record.mergeOverlay) {
    // #04 merge overlay: pure adapter-memory swap of the sheet's merge
    // set (whole-set restore — clear-then-restore does not apply). For
    // structural records this runs AFTER the engine image replay so a
    // failed engine replay never half-applies the overlay side.
    const ranges = action === 'undo' ? record.mergeOverlay.before : record.mergeOverlay.after
    state.mergeRangesBySheetId.set(record.mergeOverlay.sheetId, ranges.map(cloneRange))
  }
  if (record.filtersSnapshot) {
    // E8: REPLACE the engine's owned filter (rules + derived hidden set) back
    // to the recorded whole-workbook before/after image through the engine's
    // own `restoreFilters` snapshot primitive — the REPLACE-semantics twin of
    // `restoreTables`. The engine self-shifted its filter forward on the
    // structural op, but the cell-level undo replay above does NOT re-shift
    // it, so it is stale until we restore it here; a delete that consumed
    // filter-hidden rows has no inverse, so a full before-image is what undo
    // needs. This runs AFTER the engine cell-image replay so a failed replay
    // never half-applies the filter side.
    const snapshot =
      action === 'undo' ? record.filtersSnapshot.before : record.filtersSnapshot.after
    await requireFilterClient(state, 'restoreFilters')(snapshot)
    // Re-sync BOTH adapter mirrors from the restored engine snapshot (no extra
    // RPC — rules and hidden rows ride in the same envelope). The hidden-row
    // mirror gates projection withholding; the RULES mirror gates whether a
    // later STRUCTURAL op brackets the engine filter with a `filtersSnapshot`
    // (`recordStructuralMutation`'s `sheetHasFilter`). Undoing a CLEAR brings
    // the engine filter back, so the rules mirror MUST come back too — leaving
    // it stale-empty would make the next insert/delete skip the bracket and
    // leave the engine's self-shifted filter unrestorable on that op's undo.
    const restored = snapshot.filters.find(
      (entry) => entry.sheet === record.filtersSnapshot!.sheetIdx,
    )
    const rows = restored?.hiddenRows ?? []
    if (rows.length === 0) state.filterHiddenRowsBySheetId.delete(record.filtersSnapshot.sheetId)
    else state.filterHiddenRowsBySheetId.set(record.filtersSnapshot.sheetId, new Set(rows))
    if (restored === undefined) {
      state.filterSortStateBySheetId.delete(record.filtersSnapshot.sheetId)
    } else {
      state.filterSortStateBySheetId.set(
        record.filtersSnapshot.sheetId,
        cloneFilterSortState({ rules: restored.rules as unknown as ColumnFilterRule[] }),
      )
    }
  }
  record.boundTransactionId = request.transactionId
  source.pop()
  target.push(record)
  const nextRevision = bumpRevision(state)
  if (record.kind === 'range.fill') {
    flushDeferredAutoFillContentChange(state)
  }
  return {
    transactionId: request.transactionId,
    requestId: request.requestId,
    revision: nextRevision,
    ...(record.affectedRange ? { affectedRange: { ...record.affectedRange } } : {}),
  }
}
