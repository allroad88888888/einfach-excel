// 一句话：宿主撤销事务栈的进出与快照取像。

import type { CellRange } from '@einfach/spreadsheet-ui-core'
import type { SparseRangeWire } from '../worker-protocol'
import { WORKER_UNDO_STACK_CAP } from './limits'
import type { WorkerTransactionRecord, WorkerUndoImage } from './transaction-record'
import type { WorkerBackendState } from './state'

export function pushTransactionRecord(
  state: WorkerBackendState,
  record: WorkerTransactionRecord,
): void {
  state.undoRecords.push(record)
  if (state.undoRecords.length > WORKER_UNDO_STACK_CAP) {
    state.undoRecords.shift()
  }
  // A new mutation invalidates all forward history, mirroring
  // pushHistoryAtom truncating the UI-core redo tail.
  state.redoRecords.length = 0
}

export function dropTransactionRecords(state: WorkerBackendState): void {
  state.undoRecords.length = 0
  state.redoRecords.length = 0
}

export function notUndoableRecord(
  kind: WorkerTransactionRecord['kind'],
  sheetIdx: number,
  affectedRange: CellRange | null,
  diagnostic: string,
): WorkerTransactionRecord {
  return {
    kind,
    sheetIdx,
    boundTransactionId: null,
    affectedRange: affectedRange ? { ...affectedRange } : null,
    clearRange: null,
    before: null,
    after: null,
    diagnostic,
  }
}

export async function captureUndoImage(
  state: WorkerBackendState,
  range: SparseRangeWire,
  capture: { values: boolean; formats: boolean },
): Promise<WorkerUndoImage> {
  const cells = capture.values ? await state.client.snapshotRangeSparse(range) : null
  const format = capture.formats ? await state.client.snapshotFormatRange(range) : null
  return { cells, format }
}
