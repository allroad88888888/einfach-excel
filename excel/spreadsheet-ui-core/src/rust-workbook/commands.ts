import type {
  BackendMutationResult,
  SetCellInputRequest,
  SetFormatRangeRequest,
  SpreadsheetCellFormat,
  VisibleProjectionRequest,
  VisibleProjectionResult,
  ViewportRowHeight,
  ViewportColumnWidth,
} from '../backend'
import type { WorkerCommand, WorkerLike, WorkerTransport } from '../rust-worker'
import type { CellRange } from '../shared'
import { createWorkerTransport } from '../rust-worker'
import type { SheetVisibilityProjection } from '../viewport/hidden-state'
import type { StructuralEdit } from './structure-geometry'
import type { AutoFitLayout } from './auto-fit-measurement'
import type { RustFindCommands } from './find-commands'
import type { SelectionNumbers } from '../status-bar/types'
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

/** 单元格写入后的确认与同一 Rust 修订版可见区。 */
export interface RustSetCellInputResult {
  readonly acknowledgement: BackendMutationResult
  readonly projection: VisibleProjectionResult
}

/** 区域格式写入后的确认与同一 Rust 修订版可见区。 */
export interface RustSetRangeFormatResult {
  readonly acknowledgement: BackendMutationResult
  readonly projection: VisibleProjectionResult
}

export type RustClearRangeMode = 'contents' | 'formats' | 'all'
export interface RustClearRangeRequest {
  readonly sheetId: string
  readonly requestId: number
  readonly range: CellRange
  readonly scope: 'cell' | 'row' | 'column'
  readonly mode: RustClearRangeMode
}

export interface RustWorkbookCommands extends RustFindCommands {
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
  readonly 'clipboard.paste': WorkerCommand<
    { readonly request: RustClipboardPasteRequest; readonly projection: VisibleProjectionRequest },
    RustSetRangeFormatResult & { readonly colWidths?: ViewportColumnWidth[] }
  >
  readonly 'range.clear': WorkerCommand<
    { readonly request: RustClearRangeRequest; readonly projection: VisibleProjectionRequest },
    RustSetRangeFormatResult
  >
  readonly 'workbook.initialize': WorkerCommand<
    { readonly sheets: readonly RustWorkbookSheetInput[] },
    readonly RustWorkbookSheet[]
  >
  readonly 'workbook.importCells': WorkerCommand<
    { readonly cells: readonly RustImportCell[] },
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

/** 创建 UI Core 唯一持有的 Rust 工作簿连接。 */
export function createRustWorkbookConnection(
  workerFactory: () => WorkerLike,
): RustWorkbookConnection {
  return createWorkerTransport<RustWorkbookCommands>(workerFactory)
}
