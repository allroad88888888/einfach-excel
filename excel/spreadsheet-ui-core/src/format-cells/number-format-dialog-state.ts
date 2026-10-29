import type { CellRange } from '../shared'
import type { SpreadsheetCellFormat } from '../backend'
import type { FormatCellsSavePhase } from './types'

export type NumberFormatDialogKind = 'currency' | 'dateTime' | 'number'

export interface OpenNumberFormatDialogInput {
  kind: NumberFormatDialogKind
  sheetId: string
  range: CellRange
  initialFormat?: SpreadsheetCellFormat | null
}

export interface NumberFormatDialogOpenState {
  status: 'open'
  kind: NumberFormatDialogKind
  sheetId: string
  range: CellRange
  sessionId: number
  phase: FormatCellsSavePhase
  requestId: number | null
  pending: boolean
  error: string | null
  baseFormat: SpreadsheetCellFormat
  selectedId: string
  digits: number
}

export interface NumberFormatDialogClosedState {
  status: 'closed'
}

export type NumberFormatDialogState = NumberFormatDialogOpenState | NumberFormatDialogClosedState

export interface PatchNumberFormatDialogInput {
  selectedId?: string
  digits?: number
}
