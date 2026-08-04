// 一句话：把一次单元格级变更录成一条可撤销事务。

import type { CellRange, HistoryEntryKind } from '@einfach/spreadsheet-ui-core'
import { runtimeSupports } from './capabilities'
import { captureUndoImage, notUndoableRecord, pushTransactionRecord } from './transaction-log'
import type { WorkerUndoImage } from './transaction-record'
import type { WorkerWorkbookBackendSheet } from './types'
import { toSparseRange } from './wire-range'
import type { WorkerBackendState } from './state'

/**
 * Record one undoable cell-scoped mutation: capture the before-image,
 * run the mutation, capture the after-image, push the bounded record.
 * Snapshot failures NEVER block the mutation — the record degrades to
 * not-undoable with a diagnostic instead. A mutation that throws
 * records nothing (the UI dispatcher does not push an entry either, so
 * the two stacks stay aligned).
 */
export async function recordCellMutation<T>(state: WorkerBackendState, spec: {
  kind: HistoryEntryKind
  sheet: WorkerWorkbookBackendSheet
  range: CellRange | null
  captureValues: boolean
  captureFormats: boolean
  missingRangeDiagnostic?: string
  execute: () => Promise<T>
  /**
   * Post-execute predicate: return false to record NOTHING (the mutation
   * turned out to be an identity no-op, so an undo entry here would skew
   * the host↔worker stack alignment — UI-core pushes no history entry for
   * a no-op either). Nothing was mutated, so there is no cleanup to do.
   */
  shouldRecord?: (result: T) => boolean
}): Promise<T> {
  if (spec.range === null) {
    const result = await spec.execute()
    pushTransactionRecord(state, 
      notUndoableRecord(
        spec.kind,
        spec.sheet.idx,
        null,
        spec.missingRangeDiagnostic ?? 'mutation carried no affected range for the undo snapshot',
      ),
    )
    return result
  }
  if (spec.captureFormats && !runtimeSupports(state, 'formatSnapshots')) {
    // The mutation WILL change formats but the runtime cannot snapshot
    // them — recording values only would make undo lie about formats.
    const result = await spec.execute()
    pushTransactionRecord(state, 
      notUndoableRecord(
        spec.kind,
        spec.sheet.idx,
        spec.range,
        'runtime does not implement format snapshots; format-touching mutation is not undoable',
      ),
    )
    return result
  }

  const sparse = toSparseRange(spec.sheet.idx, spec.range)
  const capture = { values: spec.captureValues, formats: spec.captureFormats }
  let before: WorkerUndoImage | null = null
  let diagnostic = ''
  try {
    before = await captureUndoImage(state, sparse, capture)
  } catch (error) {
    diagnostic = `undo before-image snapshot failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
  const result = await spec.execute()
  if (spec.shouldRecord && !spec.shouldRecord(result)) {
    // Identity no-op: nothing changed, so record nothing (regardless of
    // whether the before-image was captured — there is nothing to undo).
    return result
  }
  if (before === null) {
    pushTransactionRecord(
      state,
      notUndoableRecord(spec.kind, spec.sheet.idx, spec.range, diagnostic),
    )
    return result
  }
  let after: WorkerUndoImage | null = null
  try {
    after = await captureUndoImage(state, sparse, capture)
  } catch (error) {
    diagnostic = `redo after-image snapshot failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
  pushTransactionRecord(state, 
    after !== null
      ? {
          kind: spec.kind,
          sheetIdx: spec.sheet.idx,
          boundTransactionId: null,
          affectedRange: { ...spec.range },
          clearRange: spec.captureValues ? sparse : null,
          before,
          after,
        }
      : notUndoableRecord(spec.kind, spec.sheet.idx, spec.range, diagnostic),
  )
  return result
}
