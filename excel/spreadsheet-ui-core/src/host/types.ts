import type { WorkerCommand } from '../rust-worker/types'
import type { CellRange } from '../shared'

export type RawCellValue =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'blank' }
  | { readonly kind: 'error'; readonly code: string }

export interface RawWorkbookCell {
  readonly row: number
  readonly col: number
  readonly input: string
  readonly formula?: string
  readonly value: RawCellValue
}

export interface WorkbookRangeTarget { readonly sheetId: string; readonly range: CellRange }
export interface ReadWorkbookRangesInput { readonly targets: readonly WorkbookRangeTarget[] }
export interface RawWorkbookRange extends WorkbookRangeTarget {
  readonly cells: readonly RawWorkbookCell[]
  readonly revision: number
}
export interface WriteWorkbookCellsInput {
  readonly cells: readonly {
    readonly sheetId: string
    readonly row: number
    readonly col: number
    readonly input: { readonly kind: 'literal'; readonly value: RawCellValue }
      | { readonly kind: 'formula'; readonly formula: string }
  }[]
  readonly source?: 'api' | 'refresh'
}
export interface HostCommandError {
  readonly code: string
  readonly message: string
  /** 连接中断无法证明原生是否提交，宿主必须重新读取/恢复连接后决定重试。 */
  readonly commitStatus?: 'unknown'
}
export type HostCommandFailure = { readonly status: 'error'; readonly error: HostCommandError }
export type ReadWorkbookRangesResult = { readonly status: 'ok'; readonly ranges: readonly RawWorkbookRange[] }
  | HostCommandFailure
export interface NativeWriteWorkbookCellsResult {
  readonly changed: boolean
  readonly revision: number
  readonly displayError?: HostCommandError
}
export type WriteWorkbookCellsResult = ({ readonly status: 'ok' } & NativeWriteWorkbookCellsResult)
  | HostCommandFailure
export type ConfigureHostControlsResult = { readonly status: 'ok' } | HostCommandFailure

export interface WorkbookChangeEvent {
  /** 每个连接都具有不同身份；同 Store 换簿后 revision 可重新从零开始。 */
  readonly connectionId: string
  readonly operationId: string
  readonly revision: number
  readonly source: 'user' | 'api' | 'import' | 'refresh' | 'history'
  readonly kind: string
  /** 空 ranges 表示表元数据；空 changes 由 kind 区分全簿目录变化与换簿。 */
  readonly changes: readonly { readonly sheetId: string; readonly ranges: readonly CellRange[] }[]
}

export interface HostControls {
  readonly readOnly: boolean
  readonly busy: boolean
  readonly allowSheetStructure: boolean
}

export interface HostCommands {
  readonly 'host.configure': WorkerCommand<HostControls, void>
  readonly 'host.readRanges': WorkerCommand<ReadWorkbookRangesInput, readonly RawWorkbookRange[]>
  readonly 'host.writeCells': WorkerCommand<WriteWorkbookCellsInput, NativeWriteWorkbookCellsResult>
}

export interface NativeMutationState {
  readonly sequence: number
  readonly changes: readonly { readonly sheetKey: string; readonly ranges: readonly CellRange[] }[]
}
export interface HostWasmCommands {
  readonly host_read_ranges?: (targets: readonly {
    readonly sheet: number; readonly range: CellRange }[]) =>
    readonly { readonly sheet: number; readonly range: CellRange;
      readonly cells: readonly RawWorkbookCell[] }[]
  readonly host_write_cells?: (cells: readonly (Omit<WriteWorkbookCellsInput['cells'][number], 'sheetId'> &
    { readonly sheet: number })[]) => boolean
  readonly host_mutation_state?: () => NativeMutationState
}
