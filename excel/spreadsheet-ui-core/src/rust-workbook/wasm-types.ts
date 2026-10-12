import type { DisplayCell, SpreadsheetCellFormat, SpreadsheetNumberFormat, ViewportRowHeight, ViewportColumnWidth } from '../backend'
import type { RangeBorderPatch } from '../backend/format-contracts'
import type { NativeFunctionCatalog } from '../formula-functions/types'
import type { RustImportCell, RustImportStats, RustClearRangeRequest } from './commands'
import type { RustClipboardCapture, RustClipboardPasteRequest } from './clipboard-commands'
import type { RustHistoryState } from '../history/rust-history-types'
import type { SheetVisibilityProjection } from '../viewport/hidden-state'
import type { AutoFitText } from './auto-fit-measurement'
import type { WasmFindQueries } from './find-commands'
import type { CellRange } from '../shared'
import type { SelectionNumbers } from '../status-bar/types'
import type { RustSortKey } from './sort-commands'
import type { ColumnFilterRule } from '../filter-sort/types'
import type { RustFilterReport, RustFilterValuesPage, RustFilterValuesQuery } from './filter-commands'
import type { NativeTextColumnsRequest, RustTextColumnsPreview, RustTextColumnsReport } from './text-columns-commands'
import type { NativeRemoveDuplicatesRequest, RustRemoveDuplicatesPreview } from './remove-duplicates-commands'
import type { NativeQuickFormulaRequest, QuickFormulaSuggestion } from './quick-formula-commands'
import type { ConditionalFormatChange, NativeConditionalFormats } from './conditional-format-commands'
import type { NativeDataValidationRule } from '../data-validation/native-rule'
import type { NativeOutlineAction } from '../outline/native-state'
import type { NativeNamedRange, NativeNamedRangeAction } from '../named-ranges/native-types'
import type { NativeTable, NativeTableAction } from '../tables/native-types'
import type { WasmSpillQueries } from './spill-commands'

export interface RustCellSnapshot {
  readonly sheet: number
  readonly addr: string
  readonly display: string
  readonly formattedDisplay?: string
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
  readonly dataBars?: readonly ({ readonly addr: string } & NonNullable<DisplayCell['dataBar']>)[]
}

export interface WasmWorkbook extends WasmSpillQueries, WasmFindQueries {
  recalculate?: (sheet?: number) => number
  snapshot_persistence_v1?: () => unknown
  restore_persistence_v1?: (value: unknown) => unknown
  free?: () => void
  filter_values?: (
    query: RustFilterValuesQuery & { readonly sheet: number },
  ) => RustFilterValuesPage
  listTables?: () => readonly NativeTable[]
  change_table?: (sheet: number, action: NativeTableAction) => boolean
  list_named_ranges?: () => readonly NativeNamedRange[]
  change_named_range?: (sheet: number, action: NativeNamedRangeAction) => boolean
  change_outline?: (sheet: number, axis: 'row' | 'column', action: NativeOutlineAction) => boolean
  getDataValidation?: (sheet: number, row: number, col: number) => NativeDataValidationRule | null
  setDataValidation?: (sheet: number, rowStart: number, colStart: number,
    rowEnd: number, colEnd: number, rule: NativeDataValidationRule | null) => void
  listConditionalFormats?: (sheet: number) => NativeConditionalFormats
  manageConditionalFormatRule?: (
    sheet: number,
    request: Exclude<ConditionalFormatChange, { action: 'set' | 'remove' }>,
  ) => NativeConditionalFormats
  setConditionalFormatRule?: (
    sheet: number,
    request: Omit<Extract<ConditionalFormatChange, { action: 'set' }>, 'action'>,
  ) => NativeConditionalFormats
  removeConditionalFormatRule?: (
    sheet: number, request: { revision: number; ruleId: string },
  ) => NativeConditionalFormats
  snapshot_display_format_range?: WasmWorkbook['snapshot_format_range']
  suggest_quick_formula?: (request: NativeQuickFormulaRequest) => QuickFormulaSuggestion
  preview_remove_duplicates?: (
    request: NativeRemoveDuplicatesRequest,
  ) => RustRemoveDuplicatesPreview
  remove_duplicates?: (request: NativeRemoveDuplicatesRequest) => RustRemoveDuplicatesPreview
  preview_text_columns?: (request: NativeTextColumnsRequest) => RustTextColumnsPreview
  split_text_columns?: (
    request: NativeTextColumnsRequest, overwrite: boolean,
  ) => RustTextColumnsReport
  preview_number_format?: (sheet: number, addr: string, format: SpreadsheetNumberFormat) => string
  applyFilter?: (
    sheet: number,
    input: { rules: readonly ColumnFilterRule[]; range?: CellRange },
  ) => RustFilterReport
  reapplyFilter?: (sheet: number) => RustFilterReport
  clearFilter?: (sheet: number) => RustFilterReport
  sortRange?: (
    sheet: number,
    input: {
      readonly range: { startRow: number; endRow: number; startCol: number; endCol: number }
      readonly keys: readonly (RustSortKey & {
        readonly caseSensitive: boolean; readonly emptyFirst: boolean
      })[]
      readonly excludedRows: readonly number[]
    },
  ) =>
    | { readonly ok: true; readonly movedRows: number }
    | { readonly ok: false; readonly code: string; readonly message?: string }
  apply_auto_fill?: (input: {
    readonly sheet: number
    readonly sourceRange: { startRow: number; endRow: number; startCol: number; endCol: number }
    readonly targetRange: { startRow: number; endRow: number; startCol: number; endCol: number }
    readonly direction: 'down' | 'right' | 'up' | 'left'
    readonly series:
      | 'copy'
      | 'integer-step'
      | 'text-number'
      | 'linear-trend'
      | 'weekday-name'
      | 'month-name'
      | 'custom-list'
      | 'date-day'
    readonly infer?: boolean
    readonly list?: { listName: string; values: readonly string[]; locale: string }
  }) => { readonly written: number }
  aggregate_selection?: (
    targets: readonly (CellRange & { readonly sheet: number })[],
  ) => SelectionNumbers
  auto_fit_dimensions?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    axis: string,
    defaultRow: number,
    defaultColumn: number,
    measure: (text: AutoFitText) => number,
  ) => boolean
  set_frozen_panes?: (sheet: number, rows: number, cols: number) => boolean
  frozen_panes?: (sheet: number) => ArrayLike<number>
  merge_cells?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    action: string,
    discard: boolean,
  ) => boolean
  merged_ranges?: (sheet: number) => ArrayLike<number>
  edit_structure?: (sheet: number, action: string, at: number, count: number) => boolean
  set_visibility?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    action: string,
  ) => boolean
  sheet_visibility?: (sheet: number) => SheetVisibilityProjection & {
    readonly filterRules?: readonly ColumnFilterRule[]
    readonly filterRange?: CellRange
  }
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
  set_cell_input_with_table_expansion?: (
    sheet: number, address: string, input: string, expandTables: boolean,
  ) => void
  capture_clipboard?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    cut: boolean,
  ) => Omit<RustClipboardCapture, 'token'>
  capture_format_painter?: (
    sheet: number, startRow: number, startCol: number, endRow: number, endCol: number,
  ) => Omit<RustClipboardCapture, 'token'>
  paste_clipboard?: (
    sheet: number,
    row: number,
    col: number,
    text: string,
    internal: boolean,
    policy: Pick<
      RustClipboardPasteRequest,
      | 'rowCount'
      | 'painter'
      | 'colCount'
      | 'unlockedRanges'
      | 'mode'
      | 'selection'
      | 'transpose'
      | 'skipBlanks'
      | 'arithmetic'
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
  clear_selection?: (request: {
    sheet: number
    mode: RustClearRangeRequest['mode']
    targets: NonNullable<RustClearRangeRequest['targets']>
  }) => CellRange
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
  patch_range_borders?: (
    sheet: number, startRow: number, startCol: number, endRow: number, endCol: number,
    patch: RangeBorderPatch,
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
  function_catalog?: () => NativeFunctionCatalog
  default(): Promise<unknown>
  WasmWorkbook: new () => unknown
}
