import type { CellCoord } from '../shared'

export type SpreadsheetOperationSource =
  | 'keyboard'
  | 'formula-bar'
  | 'selection'
  | 'sheet-tabs'
  | 'toolbar'
  | 'clipboard'
  | 'diagnostics'
  | 'programmatic'
  | 'test'

export type SpreadsheetOperationKind =
  | 'cell.set-input'
  | 'row.insert'
  | 'row.delete'
  | 'column.insert'
  | 'column.delete'
  | 'sheet.add'
  | 'sheet.delete'
  | 'sheet.rename'
  | 'sheet.reorder'

export interface SpreadsheetOperationBase {
  kind: SpreadsheetOperationKind
  source?: SpreadsheetOperationSource
  requestId?: number
  revision?: number | string
}

export interface SetCellOperationIntent extends SpreadsheetOperationBase {
  kind: 'cell.set-input'
  sheetId: string
  row: number
  col: number
  input: string
}

export interface InsertRowsOperationIntent extends SpreadsheetOperationBase {
  kind: 'row.insert'
  sheetId: string
  rowIndex: number
  count: number
}

export interface DeleteRowsOperationIntent extends SpreadsheetOperationBase {
  kind: 'row.delete'
  sheetId: string
  rowIndex: number
  count: number
}

export interface InsertColumnsOperationIntent extends SpreadsheetOperationBase {
  kind: 'column.insert'
  sheetId: string
  colIndex: number
  count: number
}

export interface DeleteColumnsOperationIntent extends SpreadsheetOperationBase {
  kind: 'column.delete'
  sheetId: string
  colIndex: number
  count: number
}

export interface AddSheetOperationIntent extends SpreadsheetOperationBase {
  kind: 'sheet.add'
  sheetName: string
  beforeSheetId: string | null
  afterSheetId: string | null
}

export interface DeleteSheetOperationIntent extends SpreadsheetOperationBase {
  kind: 'sheet.delete'
  sheetId: string
}

export interface RenameSheetOperationIntent extends SpreadsheetOperationBase {
  kind: 'sheet.rename'
  sheetId: string
  sheetName: string
}

export interface ReorderSheetOperationIntent extends SpreadsheetOperationBase {
  kind: 'sheet.reorder'
  sheetId: string
  beforeSheetId: string | null
  afterSheetId: string | null
  targetIndex: number | null
}

export type SpreadsheetOperationIntent =
  | SetCellOperationIntent
  | InsertRowsOperationIntent
  | DeleteRowsOperationIntent
  | InsertColumnsOperationIntent
  | DeleteColumnsOperationIntent
  | AddSheetOperationIntent
  | DeleteSheetOperationIntent
  | RenameSheetOperationIntent
  | ReorderSheetOperationIntent

export interface OperationContext {
  source?: SpreadsheetOperationSource
  requestId?: number
  revision?: number | string
}

export interface SetCellOperationInput extends OperationContext, CellCoord {
  sheetId: string
  input: string
}

export interface RowOperationInput extends OperationContext {
  sheetId: string
  rowIndex: number
  count: number
}

export interface ColumnOperationInput extends OperationContext {
  sheetId: string
  colIndex: number
  count: number
}

export interface AddSheetOperationInput extends OperationContext {
  sheetName: string
  beforeSheetId?: string | null
  afterSheetId?: string | null
}

export interface DeleteSheetOperationInput extends OperationContext {
  sheetId: string
}

export interface RenameSheetOperationInput extends OperationContext {
  sheetId: string
  sheetName: string
}

export interface ReorderSheetOperationInput extends OperationContext {
  sheetId: string
  beforeSheetId?: string | null
  afterSheetId?: string | null
  targetIndex?: number | null
}
