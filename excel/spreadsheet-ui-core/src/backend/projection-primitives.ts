import type { CellCoord, CellRange, SheetRef, SpreadsheetError } from '../shared'
import type { ValidationOutcome } from '../data-validation/types'
import type { DisplayCellRichValue } from '../rich-types/types'
import type { SpreadsheetCellFormat } from './cell-format'

/** 投影协议共享的标识、取消标记及单元格值类型。 */
export type ProjectionRequestId = number
export type ProjectionRevision = number | string
export type ProjectionRequestKind = 'visible-window' | 'range'

export type ProjectionRequestReason =
  | 'viewport'
  | 'selection'
  | 'keyboard'
  | 'formula-bar'
  | 'clipboard'
  | 'fill-handle'
  | 'toolbar'
  | 'diagnostics'
  | 'test'

export interface ProjectionCancelToken {
  readonly cancelled: boolean
}

export interface MergeSpan {
  rows: number
  cols: number
}

export interface MergeRegion extends SheetRef {
  range: CellRange
}

export interface DisplayCell {
  row: number
  col: number
  displayValue: string
  /** Rust 提供的原始编辑文本，与经过数字格式舍入的 displayValue 分开。 */
  inputText?: string
  /** Rust 保存的外部链接地址；显示文字仍使用普通单元格内容。 */
  hyperlink?: string
  valueKind?: 'blank' | 'number' | 'string' | 'boolean' | 'error'
  /** Read-only projection fact: the canonical finite number before display formatting. */
  numericValue?: number
  formula?: string
  error?: SpreadsheetError
  formatKey?: string
  format?: SpreadsheetCellFormat
  mergedSpan?: MergeSpan
  mergeAnchor?: CellCoord
  noteIndicator?: boolean
  commentIndicator?: boolean
  commentThreadId?: string
  validation?: ValidationOutcome
  conditionalFormat?: SpreadsheetCellFormat
  /** 原生条件格式的临时显示几何；不是 cellStyle 或单元格宽高。 */
  dataBar?: {
    readonly left: number
    readonly width: number
    readonly axis?: number
    readonly color: string
  }
  /** 图标档位已由 Rust 求解，显示层不重新比较阈值。 */
  conditionalIcon?: {
    readonly set: 'three-arrows' | 'three-traffic-lights' | 'three-flags'
    readonly index: 0 | 1 | 2
    readonly showValue: boolean
  }
  richValue?: DisplayCellRichValue
  /** Locked indicator from a protected sheet; gating logic uses unlockedRanges on the UI side. */
  locked?: boolean
}
