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
  commentThreadId?: string
  validation?: ValidationOutcome
  conditionalFormat?: SpreadsheetCellFormat
  richValue?: DisplayCellRichValue
  /** Locked indicator from a protected sheet; gating logic uses unlockedRanges on the UI side. */
  locked?: boolean
}
