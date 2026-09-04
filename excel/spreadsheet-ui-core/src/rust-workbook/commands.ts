import type {
  BackendMutationResult,
  SetCellInputRequest,
  SetFormatRangeRequest,
  SpreadsheetCellFormat,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '../backend'
import type { WorkerCommand, WorkerLike, WorkerTransport } from '../rust-worker'
import { createWorkerTransport } from '../rust-worker'

export interface RustWorkbookSheetInput {
  readonly id?: string
  readonly name: string
}

export interface RustWorkbookSheet {
  readonly id: string
  readonly index: number
  readonly name: string
}

/** 导入坐标为零基：row=0、col=0 表示 A1。 */
type RustImportCellValue =
  | { readonly sheet: number; readonly row: number; readonly col: number; readonly kind: 'number'; readonly value: number }
  | { readonly sheet: number; readonly row: number; readonly col: number; readonly kind: 'text'; readonly value: string }
  | { readonly sheet: number; readonly row: number; readonly col: number; readonly kind: 'boolean'; readonly value: boolean }
  | { readonly sheet: number; readonly row: number; readonly col: number; readonly kind: 'error'; readonly value: string }
  | { readonly sheet: number; readonly row: number; readonly col: number; readonly kind: 'formula'; readonly value: string }
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

export interface RustWorkbookCommands {
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
