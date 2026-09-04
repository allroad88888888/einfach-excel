import type { CellRange, SheetRef } from '../shared'
import type { SpreadsheetCellFormat } from './cell-format'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 区域格式写入的数据契约。 */
export interface SetFormatRangeRequest extends SheetRef {
  kind: 'set-format-range'
  range: CellRange
  format: SpreadsheetCellFormat | null
  /** 缺省保持旧的完整格式写入；React 工具栏使用稀疏 patch。 */
  writeMode?: 'patch'
  /** patch 最终写入 cellStyle、rowStyle 或 columnStyle。 */
  scope?: 'cell' | 'row' | 'column'
  /** patch 模式下需要明确清除、而不是继续继承的属性。 */
  clearFormatFields?: readonly (keyof SpreadsheetCellFormat)[]
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}
