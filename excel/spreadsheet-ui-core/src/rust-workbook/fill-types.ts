import type { ProjectionRevision } from '../contracts'
import type { CellRange } from '../shared'
import type { FillSeriesKind } from '../auto-fill/series-options'

export interface RustFillRangeRequest {
  readonly validationConfirmation?: 'continue'
  readonly validationRevision?: ProjectionRevision
  readonly sheetId: string
  readonly requestId: number
  readonly range: CellRange
  readonly direction: 'down' | 'right' | 'up' | 'left'
  readonly sourceRange?: CellRange
  readonly auto?: boolean
  readonly namedLists?: readonly RustFillNamedList[]
  /** 双击只提交来源与工作表边界；相邻连续数据的末行由 Rust 决定。 */
  readonly adjacent?: { readonly rowLimit: number }
  readonly series?: {
    readonly kind: FillSeriesKind
    readonly step?: number
    readonly stop?: number
    readonly sourceCount: number
    readonly customValues?: readonly string[]
    readonly customLocale?: string
  }
}

export interface RustFillNamedList {
  readonly kind: 'weekday-name' | 'month-name' | 'custom-list'
  readonly listName: string
  readonly values: readonly string[]
  readonly locale: string
}
