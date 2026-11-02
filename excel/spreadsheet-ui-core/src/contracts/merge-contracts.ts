import type { CellRange, SheetRef } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 单元格合并与取消合并的数据契约。 */
export interface MergeRangeRequest extends SheetRef {
  kind: 'merge-range'
  range: CellRange
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface UnmergeRangeRequest extends SheetRef {
  kind: 'unmerge-range'
  range: CellRange
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}
