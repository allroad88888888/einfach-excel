import type { VisibleProjectionRequest, VisibleProjectionResult } from '../backend'
import type { CellCoord, CellRange } from '../shared'
import type { WorkerCommand } from '../rust-worker'

/** 只传拆分选项；源文本、拆分及覆盖判断留在 Rust。 */
export type RustTextColumnsMode =
  | {
      readonly kind: 'delimited'
      readonly delimiters: readonly string[]
      readonly mergeConsecutive: boolean
      readonly qualifier: string | null
    }
  | { readonly kind: 'fixedWidth'; readonly breakpoints: readonly number[] }

export interface RustTextColumnsRequest {
  readonly sheetId: string
  readonly source: CellRange
  readonly destination: CellCoord
  readonly mode: RustTextColumnsMode
}

export interface RustTextColumnsPreview {
  readonly target: CellRange
  readonly overwrittenCells: number
  readonly sample: readonly (readonly string[])[]
  readonly sampleTruncated: boolean
}

export interface RustTextColumnsReport {
  readonly target: CellRange
  readonly changedCells: number
}

export interface RustTextColumnsApplyRequest extends RustTextColumnsRequest {
  readonly overwrite: boolean
  readonly expectedRevision: number
  readonly projection: VisibleProjectionRequest
}

export interface RustTextColumnsCommands {
  readonly 'textColumns.preview': WorkerCommand<
    RustTextColumnsRequest, RustTextColumnsPreview & { readonly revision: number }
  >
  readonly 'textColumns.apply': WorkerCommand<
    RustTextColumnsApplyRequest,
    RustTextColumnsReport & { readonly projection: VisibleProjectionResult }
  >
}

export interface NativeTextColumnsRequest extends Omit<RustTextColumnsRequest, 'sheetId'> {
  readonly sheet: number
  readonly rowCount: number
  readonly colCount: number
}
