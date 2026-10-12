import type { CellRange, SheetRef } from '../shared'
import type { SpreadsheetCellFormat, SpreadsheetBorderStyle } from './cell-format'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 边框位置由 Rust 根据范围决定，不在 JS 展开逐格命令。 */
export interface RangeBorderPatch {
  preset: 'all' | 'outside' | 'inside' | 'horizontal' | 'vertical' | 'top' | 'right' | 'bottom' | 'left' | 'none'
  style: Exclude<SpreadsheetBorderStyle, 'none'>
  color: string
}

/** 区域格式写入的数据契约。 */
export interface SetFormatRangeRequest extends SheetRef {
  kind: 'set-format-range'
  range: CellRange
  format: SpreadsheetCellFormat | null
  /** 缺省保持旧的完整格式写入；React 工具栏使用稀疏 patch。 */
  writeMode?: 'patch'
  /** patch 最终写入 cellStyle、rowStyle 或 columnStyle。 */
  scope?: 'cell' | 'row' | 'column'
  /** 全部格式目标由一次原生事务处理；缺省为上面的单一区域。 */
  targets?: readonly (CellRange & { readonly scope: 'cell' | 'row' | 'column' })[]
  /** patch 模式下需要明确清除、而不是继续继承的属性。 */
  clearFormatFields?: readonly (keyof SpreadsheetCellFormat)[]
  /** 几何边框只写有限选区的 cellStyle，不扩大成整轴属性。 */
  borderPatch?: RangeBorderPatch
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}
