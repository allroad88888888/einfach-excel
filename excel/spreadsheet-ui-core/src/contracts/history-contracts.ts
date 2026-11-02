import type { CellRange } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** Rust 事务撤销与重做的数据契约。 */
export interface UndoTransactionRequest {
  kind: 'undo-transaction'
  transactionId: string
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface RedoTransactionRequest {
  kind: 'redo-transaction'
  transactionId: string
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface HistoryTransactionResult {
  transactionId: string
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  affectedRange?: CellRange
  /** `false` 表示 Rust 明确确认此次没有重放事务。 */
  applied?: boolean
  /** `applied: false` 时供 UI 展示的原因。 */
  notAppliedReason?: string
}
