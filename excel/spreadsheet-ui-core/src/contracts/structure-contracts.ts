import type { SheetRef } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 插入或删除工作表行列的数据契约。 */
export interface InsertRowsRequest extends SheetRef {
  kind: 'insert-rows'
  rowIndex: number
  count: number
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface DeleteRowsRequest extends SheetRef {
  kind: 'delete-rows'
  rowIndex: number
  count: number
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface InsertColumnsRequest extends SheetRef {
  kind: 'insert-columns'
  colIndex: number
  count: number
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface DeleteColumnsRequest extends SheetRef {
  kind: 'delete-columns'
  colIndex: number
  count: number
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}
