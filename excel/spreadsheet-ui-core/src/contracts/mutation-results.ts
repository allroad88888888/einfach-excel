import type { CellRange, SheetRef } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 工作簿写操作共享的回执数据契约。 */
export interface BackendStructuralShift {
  axis: 'row' | 'column'
  kind: 'insert' | 'delete'
  index: number
  count: number
}

export interface BackendMutationResult extends SheetRef {
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  affectedRange?: CellRange
  /** 结构写操作造成的坐标位移；普通内容写入不返回。 */
  structuralShift?: BackendStructuralShift
}

/** 自动填充是否真正产生了一条 Rust 历史事务。 */
export type AutoFillMutationResult =
  | (Omit<BackendMutationResult, 'affectedRange' | 'structuralShift'> & {
      applied: false
      historyTransactionCount: 0
      historyDisposition: 'none'
      affectedRange?: never
      structuralShift?: never
    })
  | (Omit<BackendMutationResult, 'affectedRange' | 'revision' | 'structuralShift'> & {
      applied: true
      historyTransactionCount: 1
      historyDisposition: 'undoable' | 'not-undoable'
      revision: ProjectionRevision
      affectedRange: CellRange
      structuralShift?: never
    })
