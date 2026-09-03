import type { CellRange, SheetRef } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 区域自动填充的数据契约。 */
export type SpreadsheetFillDirection = 'up' | 'down' | 'left' | 'right'

export interface FillRangeRequest extends SheetRef {
  kind: 'fill-range'
  sourceRange: CellRange
  targetRange: CellRange
  direction: SpreadsheetFillDirection
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}
