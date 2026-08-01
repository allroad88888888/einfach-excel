import type { WorkerCommandHandler } from './worker-command'
import { postResponse } from './worker-post'
import { exportRangeTsv } from './worker-range-stream'
import { resetSessionHandles } from './worker-session-registry'
import {
  assertMethod,
  assertSheet,
  normalizeSnapshot,
  normalizeSparseCell,
  normalizeSparseRange,
} from './worker-wire-guards'
import type { SparseCellWire, WorkbookPersistenceSnapshotWire } from './worker-protocol'

/** 一次性的整簿/整区读写：稀疏快照与恢复、持久化 v1、区间 TSV 导出。 */

export const handleSnapshotCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    case 'snapshotSparse': {
      const snapshotSparse = assertMethod(wb, 'snapshot_sparse')
      postResponse(id, snapshotSparse.call(wb).map(normalizeSparseCell))
      return true
    }
    case 'snapshotRangeSparse': {
      const range = normalizeSparseRange(msg.range)
      assertSheet(wb, range.sheet)
      const snapshotRangeSparse = assertMethod(wb, 'snapshot_range_sparse')
      postResponse(
        id,
        snapshotRangeSparse
          .call(wb, range.sheet, range.startRow, range.startCol, range.endRow, range.endCol)
          .map(normalizeSparseCell),
      )
      return true
    }
    case 'restoreSparse': {
      const restoreSparse = assertMethod(wb, 'restore_sparse')
      const cells = Array.isArray(msg.cells)
        ? (msg.cells as SparseCellWire[]).map(normalizeSparseCell)
        : []
      postResponse(id, restoreSparse.call(wb, cells))
      return true
    }
    case 'readSparseRange': {
      const range = normalizeSparseRange(msg.range)
      assertSheet(wb, range.sheet)
      const readSparseRange = assertMethod(wb, 'read_sparse_range')
      postResponse(
        id,
        readSparseRange
          .call(wb, range.sheet, range.startRow, range.startCol, range.endRow, range.endCol)
          .map(normalizeSnapshot),
      )
      return true
    }
    case 'snapshotPersistenceV1': {
      const snapshotPersistenceV1 = assertMethod(wb, 'snapshot_persistence_v1')
      postResponse(id, snapshotPersistenceV1.call(wb))
      return true
    }
    case 'restorePersistenceV1': {
      const restorePersistenceV1 = assertMethod(wb, 'restore_persistence_v1')
      const stats = restorePersistenceV1.call(wb, msg.snapshot as WorkbookPersistenceSnapshotWire)
      // 整簿内容被换掉：旧的会话游标与订阅 token 指向的已经不是同一批数据。
      resetSessionHandles(wb)
      postResponse(id, stats)
      return true
    }
    case 'exportRangeTsv': {
      const range = normalizeSparseRange(msg.range)
      postResponse(id, exportRangeTsv(wb, range))
      return true
    }
    default:
      return false
  }
}
