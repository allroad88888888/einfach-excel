import type { VisibleProjectionRequest, VisibleProjectionResult } from '../backend'
import type { CellRange } from '../shared'
import type { WorkerCommand } from '../rust-worker'

export type RustDuplicateComparison = 'exact' | 'ignoreCase' | 'trim' | 'trimIgnoreCase'

/** 只传范围及选项，不把全部单元格搬到 JS 扫描。 */
export interface RustRemoveDuplicatesRequest {
  readonly sheetId: string
  readonly range: CellRange
  readonly columns: readonly number[]
  readonly hasHeader: boolean
  readonly comparison: RustDuplicateComparison
}
export interface RustRemoveDuplicatesPreview {
  readonly scannedRows: number
  readonly removedRows: number
  readonly uniqueRows: number
  readonly excludedRows: number
  readonly headers: readonly string[]
  readonly sampleOffset: number
  readonly sample: readonly {
    readonly row: number; readonly firstRow: number; readonly values: readonly string[]
  }[]
  readonly sampleTruncated: boolean
}
export interface RustRemoveDuplicatesPreviewRequest extends RustRemoveDuplicatesRequest {
  readonly sampleOffset?: number
  readonly expectedRevision?: number
}
export interface RustRemoveDuplicatesApplyRequest extends RustRemoveDuplicatesRequest {
  readonly expectedRevision: number
  readonly projection: VisibleProjectionRequest
}
export interface RustRemoveDuplicatesCommands {
  readonly 'duplicates.preview': WorkerCommand<
    RustRemoveDuplicatesPreviewRequest, RustRemoveDuplicatesPreview & { readonly revision: number }
  >
  readonly 'duplicates.apply': WorkerCommand<
    RustRemoveDuplicatesApplyRequest,
    RustRemoveDuplicatesPreview & { readonly projection: VisibleProjectionResult }
  >
}
export interface NativeRemoveDuplicatesRequest extends Omit<RustRemoveDuplicatesRequest, 'sheetId'> {
  readonly sheet: number
  readonly rowCount: number
  readonly colCount: number
  readonly sampleOffset?: number
}
