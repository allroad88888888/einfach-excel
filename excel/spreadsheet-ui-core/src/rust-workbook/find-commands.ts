import type {
  SpreadsheetCellFormat,
  VisibleProjectionRequest,
  VisibleProjectionResult,
  ViewportRowHeight,
  ViewportColumnWidth,
} from '../contracts'
import type { WorkerCommand } from '../rust-worker'
import type { CellRange } from '../shared'

export type FindNumberFormatKind =
  | 'general'
  | 'text'
  | 'number'
  | 'percent'
  | 'currency'
  | 'accounting'
  | 'date'
  | 'time'
  | 'scientific'
  | 'fraction'
  | 'special'
  | 'custom'

export type FindAlign = 'default' | 'left' | 'center' | 'right' | 'center-across'

export interface RustFindFormatFilter {
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly textColor?: string
  readonly bgColor?: string
  readonly fontSize?: number
  readonly fontFamily?: string
  readonly align?: FindAlign
  readonly wrapText?: boolean
  readonly numberFormat?: FindNumberFormatKind
  readonly customFormatCode?: string
}

export interface RustFindQuery {
  readonly needle: string
  readonly caseSensitive: boolean
  readonly wholeCell: boolean
  readonly wildcards?: boolean
  readonly lookIn: 'values' | 'formulas'
  readonly format?: RustFindFormatFilter
}

export interface RustFindMatch {
  readonly sheetId: string
  readonly row: number
  readonly col: number
  /** UTF-16 半开区间；仅按格式命中空白格时为 0..0。 */
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
  readonly replaceFormat?: RustFindFormatFilter
  readonly current?: RustFindMatch
  readonly expectedRevision: number
  readonly projection: VisibleProjectionRequest
}

export interface RustFindCommands {
  readonly 'workbook.locate': WorkerCommand<
    { readonly sheetId: string; readonly range: CellRange;
      readonly kind: LocateKind; readonly limit: number },
    LocatedCells & { readonly revision: number }
  >
  readonly 'workbook.find': WorkerCommand<
    RustFindRequest,
    {
      readonly total: number
      readonly matches: readonly RustFindMatch[]
      readonly revision: number
    }
  >
  readonly 'workbook.sampleBaseFormat': WorkerCommand<
    { readonly sheetId: string; readonly row: number; readonly col: number },
    { readonly format: SpreadsheetCellFormat | null }
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
  readonly replaceFormat?: RustFindFormatFilter
  readonly current?: NativeFindMatch
}

export type LocateKind = 'constants' | 'formulas' | 'blanks'
export interface LocatedCells {
  /** 原生实际查询范围，包含与输入范围相交的完整合并格。 */
  readonly scope: CellRange
  readonly ranges: readonly CellRange[]
  readonly cellCount: number
}

/** 原生查找/定位协议；不在 JS 镜像任何工作簿索引。 */
export interface WasmFindQueries {
  find_cells?: (request: NativeFindRequest) => { total: number; matches: NativeFindMatch[] }
  replace_by_query?: (request: NativeReplaceRequest) => { cells: number; occurrences: number }
  locate_cells?: (request: { readonly sheet: number; readonly range: CellRange;
    readonly kind: LocateKind; readonly limit: number }) => LocatedCells
}
