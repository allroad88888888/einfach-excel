import type {
  VisibleProjectionRequest,
  VisibleProjectionResult,
  ViewportRowHeight,
  ViewportColumnWidth,
} from '../backend'
import type { WorkerCommand } from '../rust-worker'
import type { CellRange } from '../shared'

export interface RustFindQuery {
  readonly needle: string
  readonly caseSensitive: boolean
  readonly wholeCell: boolean
  readonly wildcards?: boolean
  readonly lookIn: 'values' | 'formulas'
}

export interface RustFindMatch {
  readonly sheetId: string
  readonly row: number
  readonly col: number
  /** 原生返回的非空 UTF-16 半开区间。 */
  readonly start: number
  readonly end: number
}

export interface RustFindRequest {
  readonly targets: readonly { readonly sheetId: string; readonly range: CellRange }[]
  readonly query: RustFindQuery
  readonly offset: number
  readonly limit: number
}

export interface RustReplaceRequest extends Pick<RustFindRequest, 'targets' | 'query'> {
  readonly replacement: string
  readonly current?: RustFindMatch
  readonly expectedRevision: number
  readonly projection: VisibleProjectionRequest
}

export interface RustFindCommands {
  readonly 'workbook.find': WorkerCommand<
    RustFindRequest,
    {
      readonly total: number
      readonly matches: readonly RustFindMatch[]
      readonly revision: number
    }
  >
  readonly 'workbook.replace': WorkerCommand<
    RustReplaceRequest,
    {
      readonly cells: number
      readonly occurrences: number
      readonly projection: VisibleProjectionResult
      readonly sizes: {
        readonly rowHeights: ViewportRowHeight[]
        readonly colWidths: ViewportColumnWidth[]
      }
    }
  >
}

/** 只有传输边界使用原生表索引；UI 始终使用稳定 sheetId。 */
export interface NativeFindRequest extends Pick<RustFindRequest, 'query' | 'offset' | 'limit'> {
  readonly targets: readonly (CellRange & { readonly sheet: number })[]
}
export interface NativeFindMatch extends Omit<RustFindMatch, 'sheetId'> {
  readonly sheet: number
}
export interface NativeReplaceRequest extends Pick<NativeFindRequest, 'targets' | 'query'> {
  readonly replacement: string
  readonly current?: NativeFindMatch
}
