import type { VisibleProjectionRequest, VisibleProjectionResult } from '../backend'
import type { WorkerCommand } from '../rust-worker'
import type { CellRange } from '../shared'

export interface RustSortKey {
  readonly col: number
  readonly direction: 'asc' | 'desc'
}
export interface SortRangeOptions {
  readonly keys: readonly RustSortKey[]
  readonly hasHeader: boolean
}
export interface RustSortCommands {
  readonly 'range.sort': WorkerCommand<
    SortRangeOptions & {
      readonly sheetId: string
      readonly range: CellRange
      readonly projection: VisibleProjectionRequest
    },
    { readonly movedRows: number; readonly projection: VisibleProjectionResult }
  >
}
