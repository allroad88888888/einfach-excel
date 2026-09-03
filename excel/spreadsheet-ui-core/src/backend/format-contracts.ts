import type { CellRange, SheetRef } from '../shared'
import type { SpreadsheetCellFormat } from './cell-format'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 区域格式写入的数据契约。 */
export interface SetFormatRangeRequest extends SheetRef {
  kind: 'set-format-range'
  range: CellRange
  format: SpreadsheetCellFormat | null
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}
