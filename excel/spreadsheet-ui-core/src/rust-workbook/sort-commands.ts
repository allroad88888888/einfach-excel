import type { VisibleProjectionRequest, VisibleProjectionResult } from '../contracts'
import type { WorkerCommand } from '../rust-worker'
import type { CellRange } from '../shared'

export interface RustSortKey {
  readonly col: number
  readonly direction: 'asc' | 'desc'
  /** A request-local snapshot from the shared named-list directory. */
  readonly list?: { readonly values: readonly string[]; readonly locale: string }
}
export interface RustColorSortKey {
  readonly col: number
  readonly sortOn: 'cell-color' | 'font-color'
  readonly color: string | null
  readonly position: 'top' | 'bottom'
}
export type RustSortCriterion = RustSortKey | RustColorSortKey

export interface SortRangeOptions {
  readonly keys: readonly RustSortCriterion[]
  readonly hasHeader: boolean
  readonly caseSensitive?: boolean
  readonly emptyFirst?: boolean
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
