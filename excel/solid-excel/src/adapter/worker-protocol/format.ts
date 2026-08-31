import type { SpreadsheetCellFormat } from '@einfach/spreadsheet-ui-core'

export type CellFormatJSON = SpreadsheetCellFormat

export interface CellFormatSnapshot {
  addr: string
  format: CellFormatJSON
}

export interface RangeFormatLayerSnapshot {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  format: CellFormatJSON
}

export interface FormatRangeSnapshot {
  sheet?: number
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  cellFormats: CellFormatSnapshot[]
  rangeFormats: RangeFormatLayerSnapshot[]
}

export type FormulaMutationErrorCode = 'INVALID_FORMULA' | 'FORMULA_CYCLE' | 'FORMULA_REJECTED'

export type FormulaMutationResult =
  | { ok: true }
  | { ok: false; code: FormulaMutationErrorCode; message: string; display?: string }
