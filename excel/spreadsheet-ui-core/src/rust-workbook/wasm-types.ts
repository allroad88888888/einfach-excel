import type { SpreadsheetCellFormat, ViewportRowHeight, ViewportColumnWidth } from '../backend'
import type { RustImportCell, RustImportStats } from './commands'
import type { RustClipboardCapture, RustClipboardPasteRequest } from './clipboard-commands'
import type { RustHistoryState } from '../history/rust-history-types'

export interface RustCellSnapshot {
  readonly sheet: number
  readonly addr: string
  readonly display: string
  readonly inputText?: string
  readonly type: 'number' | 'text' | 'boolean' | 'error' | 'null'
  readonly isError: boolean
  readonly formula: string
}

export type RustSparseCellStyle = {
  readonly [Key in keyof SpreadsheetCellFormat]?: SpreadsheetCellFormat[Key] | null
}

export interface RustCellStyleSnapshot {
  readonly addr: string
  readonly format: RustSparseCellStyle
}

export interface RustIndexedStyleSnapshot {
  readonly index: number
  readonly format: RustSparseCellStyle
}

export interface RustIndexedRowStyleSnapshot extends RustIndexedStyleSnapshot {
  readonly height?: number
}

export interface RustFormatRangeSnapshot {
  readonly cellStyles: readonly RustCellStyleSnapshot[]
  readonly rowStyles: readonly RustIndexedRowStyleSnapshot[]
  readonly columnStyles: readonly RustIndexedStyleSnapshot[]
}

export interface WasmWorkbook {
  history_begin?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    label: string,
    content: boolean,
  ) => void
  history_finish?: (success: boolean) => void
  history_clear?: (notice: string) => void
  history_apply?: (direction: 'undo' | 'redo') => boolean
  history_state?: () => RustHistoryState
  resize_range?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    axis: string,
    pixels: number,
  ) => void
  snapshot_viewport_sizes?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => {
    rowHeights?: ViewportRowHeight[]
    colWidths?: ViewportColumnWidth[]
  }
  set_cell_input?: (sheet: number, address: string, input: string) => void
  capture_clipboard?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    cut: boolean,
  ) => Omit<RustClipboardCapture, 'token'>
  paste_clipboard?: (
    sheet: number,
    row: number,
    col: number,
    text: string,
    internal: boolean,
    policy: Pick<
      RustClipboardPasteRequest,
      'rowCount' | 'colCount' | 'unlockedRanges' | 'mode' | 'selection' | 'transpose' | 'skipBlanks'
    >,
  ) => ArrayLike<number>
  sheet_count(): number
  sheet_name(index: number): string
  sheet_key?(index: number): string
  add_sheet(name: string): number
  edit_sheet(index: number | undefined, name: string): number
  remove_sheet(index: number): boolean
  move_sheet(from: number, to: number): boolean
  rename_sheet(index: number, name: string): boolean
  snapshotCell(sheet: number, addr: string): RustCellSnapshot
  bulk_import_cells(cells: readonly RustImportCell[]): RustImportStats
  clear_range?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => number
  set_format_range?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    format: SpreadsheetCellFormat | null,
  ) => number
  patch_format_range?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    patch: Readonly<Record<string, unknown>>,
    scope: 'cell' | 'row' | 'column',
  ) => number
  snapshot_format_range?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => RustFormatRangeSnapshot
  read_sparse_range?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => RustCellSnapshot[]
}

export interface RustWasmModule {
  default(): Promise<unknown>
  WasmWorkbook: new () => unknown
}
