import type {
  SetCellInputRequest,
  ProjectionRevision,
  SetFormatRangeRequest,
  SpreadsheetCellFormat,
  SpreadsheetNumberFormat,
  VisibleProjectionRequest,
  VisibleProjectionResult,
  ViewportRowHeight,
  ViewportColumnWidth,
} from '../backend'
import type { WorkerCommand, WorkerLike, WorkerTransport } from '../rust-worker'
import type { FillSeriesKind } from '../auto-fill/series-options'
import type { CellRange } from '../shared'
import { createHostWorkbookConnection } from '../host/connection'
import type { HostCommands } from '../host/types'
import type { SheetVisibilityProjection } from '../viewport/hidden-state'
import type { StructuralEdit } from './structure-geometry'
import type { AutoFitLayout } from './auto-fit-measurement'
import type { RustFindCommands } from './find-commands'
import type { RustSortCommands } from './sort-commands'
import type { RustFilterCommands } from './filter-commands'
import type { ColumnFilterGroup, ColumnFilterRule } from '../filter-sort/types'
import type { RustTextColumnsCommands } from './text-columns-commands'
import type { RustRemoveDuplicatesCommands } from './remove-duplicates-commands'
import type { RustQuickFormulaCommands } from './quick-formula-commands'
import type { RustConditionalFormatCommands } from './conditional-format-commands'
import type { RustDataValidationCommands } from './data-validation-commands'
import type { RustOutlineCommands } from './outline-io'
import type { RustNamedRangeCommands } from './named-range-commands'
import type { RustTableCommands } from './table-commands'
import type { RustWorkbookFileCommands } from './file-commands'
import type { RustSpillCommands } from './spill-commands'
import type { RustHyperlinkCommands } from './hyperlink/command'
import type { RustNoteCommands } from './notes/command'
import type { RustCommentCommands } from './comments/command'
import type { RustProtectionCommands } from './protection/commands'
import type { RustCustomFormulaCommands } from './custom-formulas/command'
import type { RustAsyncFormulaCommands } from './async-formulas/commands'
import type { NativeCustomFormulaDefinition } from '../custom-formulas/expression-types'
import type { NativeTableStyle } from '../tables/native-types'
import type { NativeOutline } from '../outline/native-state'
import type { NativeDataValidationRule } from '../data-validation/native-rule'
import type { NativeConditionalFormatRule, ConditionalFormatScope } from '../conditional-formatting/types'
import type { SelectionNumbers } from '../status-bar/types'
import type { RustSetCellInputResult, RustSetRangeFormatResult } from './mutation-results'
export type { RustSetCellInputResult, RustSetRangeFormatResult } from './mutation-results'
import type {
  RustClipboardCapture,
  RustClipboardCaptureRequest,
  RustClipboardPasteRequest,
  RustClipboardExport,
  RustClipboardExportRequest,
} from './clipboard-commands'

export interface RustWorkbookSheetInput {
  readonly id?: string
  readonly name: string
  readonly rowCount?: number
  readonly colCount?: number
  readonly rowHeights?: readonly ViewportRowHeight[]
  readonly colWidths?: readonly ViewportColumnWidth[]
  readonly hiddenRows?: readonly number[]
  readonly hiddenColumns?: readonly number[]
  readonly mergedRanges?: readonly CellRange[]
  readonly freeze?: { readonly rows: number; readonly cols: number }
  readonly outline?: NativeOutline
  readonly hyperlinks?: readonly {
    readonly row: number; readonly col: number; readonly url: string
  }[]
  readonly notes?: readonly {
    readonly row: number; readonly col: number; readonly text: string
  }[]
  readonly comments?: readonly {
    readonly row: number; readonly col: number; readonly author: string; readonly body: string
  }[]
  /** 仅配置初始允许区，工作表仍默认 open。 */
  readonly editableRanges?: readonly CellRange[]
  /** 工作簿级名称；范围属于本张表，事实在 Rust 初始化时建立。 */
  readonly namedRanges?: readonly { readonly name: string; readonly range: CellRange }[]
  /** 表头来自导入数据；Table 必须在全部内容导入后建立。 */
  readonly tables?: readonly {
    readonly name: string; readonly range: CellRange
    readonly totals?: boolean; readonly style?: NativeTableStyle
    /** 按 Table 列顺序声明初始公式；null 保留普通列，Rust 负责整列填充。 */
    readonly calculatedColumns?: readonly (string | null)[]
    /** 种子筛选交给 Rust 扫描；不接受前端自算的隐藏行。 */
    readonly filterRules?: readonly ColumnFilterRule[]
    readonly filterGroups?: readonly ColumnFilterGroup[]
  }[]
  readonly dataValidations?: readonly {
    readonly range: CellRange
    readonly rule: NativeDataValidationRule
  }[]
  readonly conditionalFormats?: readonly {
    readonly scope: ConditionalFormatScope
    readonly rule: NativeConditionalFormatRule
  }[]
}

export interface RustWorkbookSheet {
  readonly id: string
  readonly index: number
  readonly name: string
  readonly key?: string
  readonly rowCount?: number
  readonly colCount?: number
}

/** 导入坐标为零基：row=0、col=0 表示 A1。 */
type RustImportCellValue =
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'number'
      readonly value: number
    }
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'text'
      readonly value: string
    }
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'boolean'
      readonly value: boolean
    }
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'error'
      readonly value: string
    }
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'formula'
      readonly value: string
    }
  | { readonly sheet: number; readonly row: number; readonly col: number; readonly kind: 'null' }

/** Rust 批量导入格；可选格式仍直接写入 Rust，不产生 React 数据副本。 */
export type RustImportCell = RustImportCellValue & {
  readonly format?: SpreadsheetCellFormat
}

export interface RustImportStats {
  readonly accepted: number
  readonly formulas: number
  readonly rejectedFormulas: number
  readonly cleared: number
  readonly errors: number
  readonly issues?: readonly unknown[]
}

export type RustClearRangeMode = 'contents' | 'formats' | 'all'
export interface RustClearRangeRequest {
  readonly sheetId: string
  readonly requestId: number
  readonly range: CellRange
  readonly scope: 'cell' | 'row' | 'column'
  readonly mode: RustClearRangeMode
  /** 全部选区一次提交；省略时仍可表达现有单范围调用。 */
  readonly targets?: readonly (CellRange & { readonly scope: 'cell' | 'row' | 'column' })[]
}

export interface RustWorkbookCommands
  extends HostCommands, RustFindCommands,
    RustSortCommands,
    RustFilterCommands,
    RustTextColumnsCommands,
    RustRemoveDuplicatesCommands,
    RustQuickFormulaCommands,
    RustConditionalFormatCommands,
    RustDataValidationCommands,
    RustSpillCommands,
    RustOutlineCommands,
    RustNamedRangeCommands,
    RustTableCommands,
    RustWorkbookFileCommands,
    RustHyperlinkCommands,
    RustNoteCommands,
    RustCommentCommands,
    RustProtectionCommands,
    RustCustomFormulaCommands,
    RustAsyncFormulaCommands {
  readonly 'format.preview': WorkerCommand<
    {
      readonly sheetId: string
      readonly addr: string
      readonly numberFormat: SpreadsheetNumberFormat
    },
    string
  >
  readonly 'range.fill': WorkerCommand<
    { readonly request: RustFillRangeRequest; readonly projection: VisibleProjectionRequest },
    RustSetRangeFormatResult & {
      readonly sizes: {
        readonly rowHeights: ViewportRowHeight[]
        readonly colWidths: ViewportColumnWidth[]
      }
    }
  >
  readonly 'selection.aggregate': WorkerCommand<
    { readonly targets: readonly { readonly sheetId: string; readonly range: CellRange }[] },
    SelectionNumbers & { readonly revision: number }
  >
  readonly 'sheet.freeze': WorkerCommand<
    {
      readonly sheetId: string
      readonly rows: number
      readonly cols: number
      readonly projection: VisibleProjectionRequest
    },
    { readonly changed: boolean; readonly projection: VisibleProjectionResult }
  >
  readonly 'range.merge': WorkerCommand<
    {
      readonly sheetId: string
      readonly range: CellRange
      readonly action: 'merge' | 'center' | 'unmerge'
      readonly discard: boolean
      readonly projection: VisibleProjectionRequest
    },
    { readonly changed: boolean; readonly projection: VisibleProjectionResult }
  >
  readonly 'sheet.editStructure': WorkerCommand<
    {
      readonly sheetId: string
      readonly edit: StructuralEdit
      readonly projection: VisibleProjectionRequest
    },
    {
      readonly sheet: RustWorkbookSheet
      readonly projection: VisibleProjectionResult
      readonly range: CellRange
      readonly sizes: {
        readonly rowHeights: ViewportRowHeight[]
        readonly colWidths: ViewportColumnWidth[]
      }
    }
  >
  readonly 'range.visibility': WorkerCommand<
    {
      readonly sheetId: string
      readonly range: CellRange
      readonly action: 'hide-rows' | 'hide-columns' | 'unhide'
      readonly projection: VisibleProjectionRequest
    },
    { readonly changed: boolean; readonly projection: VisibleProjectionResult }
  >
  readonly 'history.apply': WorkerCommand<
    { readonly direction: 'undo' | 'redo'; readonly projection: VisibleProjectionRequest },
    {
      readonly projection: VisibleProjectionResult
      readonly range: CellRange
      readonly sheetId: string
      readonly sheets?: readonly RustWorkbookSheet[]
      readonly visibility?: SheetVisibilityProjection
      readonly sizes: {
        readonly rowHeights: ViewportRowHeight[]
        readonly colWidths: ViewportColumnWidth[]
      }
    }
  >
  readonly 'range.resize': WorkerCommand<
    {
      readonly sheetId: string
      readonly range: CellRange
      readonly axis: 'row' | 'column' | 'reset'
      readonly pixels: number
      readonly autoFit?: AutoFitLayout
      readonly projection: VisibleProjectionRequest
    },
    {
      readonly projection: VisibleProjectionResult
      /** 完整目标范围的尺寸，不局限于当前屏幕。 */
      readonly sizes: {
        readonly rowHeights: ViewportRowHeight[]
        readonly colWidths: ViewportColumnWidth[]
      }
    }
  >
  readonly 'workbook.changeSheets': WorkerCommand<
    (
      | { readonly operation: 'delete'; readonly sheetId: string }
      | { readonly operation: 'move'; readonly sheetId: string; readonly targetIndex: number }
    ) & { readonly projection?: VisibleProjectionRequest },
    {
      readonly sheets: readonly RustWorkbookSheet[]
      readonly revision: number
      readonly projection?: VisibleProjectionResult
    }
  >
  readonly 'workbook.editSheet': WorkerCommand<
    {
      readonly sheetId?: string
      readonly name: string
      readonly rowCount?: number
      readonly colCount?: number
      readonly projection?: VisibleProjectionRequest
    },
    {
      readonly sheet: RustWorkbookSheet
      readonly revision: number
      readonly projection?: VisibleProjectionResult
    }
  >
  readonly 'clipboard.export': WorkerCommand<RustClipboardExportRequest, RustClipboardExport>
  readonly 'clipboard.capture': WorkerCommand<RustClipboardCaptureRequest, RustClipboardCapture>
  readonly 'clipboard.finishCapture': WorkerCommand<{ token: string; commit: boolean }, void>
  readonly 'clipboard.paste': WorkerCommand<
    { readonly request: RustClipboardPasteRequest; readonly projection: VisibleProjectionRequest },
    RustSetRangeFormatResult & { readonly colWidths?: ViewportColumnWidth[] }
  >
  readonly 'range.clear': WorkerCommand<
    { readonly request: RustClearRangeRequest; readonly projection: VisibleProjectionRequest },
    RustSetRangeFormatResult
  >
  readonly 'workbook.initialize': WorkerCommand<
    {
      readonly sheets: readonly RustWorkbookSheetInput[]
      readonly customFormulas?: readonly NativeCustomFormulaDefinition[]
    },
    readonly RustWorkbookSheet[]
  >
  readonly 'workbook.importCells': WorkerCommand<
    {
      readonly cells: readonly RustImportCell[]
      readonly tables?: readonly (NonNullable<RustWorkbookSheetInput['tables']>[number] & {
        readonly sheetId: string
      })[]
    },
    RustImportStats
  >
  readonly 'projection.readVisible': WorkerCommand<
    { readonly request: VisibleProjectionRequest },
    VisibleProjectionResult
  >
  readonly 'cell.setInput': WorkerCommand<
    {
      readonly request: SetCellInputRequest
      readonly projection: VisibleProjectionRequest
    },
    RustSetCellInputResult
  >
  readonly 'format.setRange': WorkerCommand<
    {
      readonly request: SetFormatRangeRequest
      readonly projection: VisibleProjectionRequest
    },
    RustSetRangeFormatResult
  >
}

export type RustWorkbookConnection = WorkerTransport<RustWorkbookCommands>

export interface RustFillRangeRequest {
  readonly validationConfirmation?: 'continue'
  readonly validationRevision?: ProjectionRevision
  readonly sheetId: string
  readonly requestId: number
  readonly range: CellRange
  readonly direction: 'down' | 'right' | 'up' | 'left'
  readonly sourceRange?: CellRange
  readonly auto?: boolean
  /** 双击只提交来源与工作表边界；相邻连续数据的末行由 Rust 决定。 */
  readonly adjacent?: { readonly rowLimit: number }
  readonly series?: {
    readonly kind: FillSeriesKind
    readonly sourceCount: number
    readonly customValues?: readonly string[]
  }
}

/** 创建 UI Core 唯一持有的 Rust 工作簿连接。 */
export function createRustWorkbookConnection(
  workerFactory: () => WorkerLike,
): RustWorkbookConnection {
  return createHostWorkbookConnection(workerFactory)
}
