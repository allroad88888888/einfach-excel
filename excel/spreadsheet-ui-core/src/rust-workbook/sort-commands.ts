import type { DisplayCell, VisibleProjectionRequest, VisibleProjectionResult } from '../contracts'
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
export interface RustIconSortKey {
  readonly col: number
  readonly sortOn: 'icon'
  readonly icon: Pick<NonNullable<DisplayCell['conditionalIcon']>, 'set' | 'index'> | null
  readonly position: 'top' | 'bottom'
}
export type RustAppearanceSortKey = RustColorSortKey | RustIconSortKey
export type RustSortCriterion = RustSortKey | RustAppearanceSortKey

export type RustRowSortKey = Omit<RustSortKey, 'col'> & { readonly row: number }
type RowAppearance<T> = T extends RustAppearanceSortKey
  ? Omit<T, 'col' | 'position'> & { readonly row: number; readonly position: 'left' | 'right' }
  : never
export type RustRowAppearanceSortKey = RowAppearance<RustAppearanceSortKey>
export type RustRowSortCriterion = RustRowSortKey | RustRowAppearanceSortKey

type CompareOptions = { readonly caseSensitive?: boolean; readonly emptyFirst?: boolean }

export type SortRangeOptions = CompareOptions & (
  | { readonly orientation?: 'top-to-bottom'; readonly keys: readonly RustSortCriterion[];
      readonly hasHeader: boolean }
  | { readonly orientation: 'left-to-right'; readonly keys: readonly RustRowSortCriterion[];
      readonly hasHeader: false }
)
export interface SortMovement {
  readonly movedRows: number
  readonly movedColumns?: number
}
export interface RustSortCommands {
  readonly 'range.sort': WorkerCommand<
    SortRangeOptions & {
      readonly sheetId: string
      readonly range: CellRange
      readonly projection: VisibleProjectionRequest
    },
    SortMovement & { readonly projection: VisibleProjectionResult }
  >
}

export type WasmSortRange = (
  sheet: number,
  input: {
    readonly range: { startRow: number; endRow: number; startCol: number; endCol: number }
    readonly keys: readonly (RustAppearanceSortKey | RustRowAppearanceSortKey |
      (RustSortKey | RustRowSortKey) & Required<CompareOptions>)[]
    readonly orientation?: SortRangeOptions['orientation']
    readonly excludedRows: readonly number[]
  },
) => ({ readonly ok: true } & SortMovement) |
  { readonly ok: false; readonly code: string; readonly message?: string }
