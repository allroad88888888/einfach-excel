import type { VisibleProjectionRequest, VisibleProjectionResult } from '../contracts'
import type { WorkerCommand } from '../rust-worker'
import type { CellCoord, CellRange } from '../shared'

export interface AdvancedFilterRangeReference {
  readonly sheetId: string
  readonly range: CellRange
}

export interface AdvancedFilterRangeCriteria {
  readonly criteria?: AdvancedFilterRangeReference
  readonly uniqueOnly: boolean
}

export interface AdvancedFilterCopyRequest extends AdvancedFilterRangeCriteria {
  readonly source: AdvancedFilterRangeReference
  readonly sheetId: string
  readonly destination: CellCoord
  readonly outputFields?: readonly string[]
}

export interface AdvancedFilterCopyReport {
  readonly target: CellRange
  readonly matchedRows: number
}

export interface AdvancedFilterCopyPreview extends AdvancedFilterCopyReport {
  readonly overwrittenCells: number
  readonly sample: readonly (readonly string[])[]
  readonly sampleTruncated: boolean
}

export interface FilterOverwriteApproval {
  readonly target: CellRange
  readonly count: number
}

export interface AdvancedFilterCopyResult extends AdvancedFilterCopyReport {
  readonly changedCells: number
}

export interface AdvancedFilterCopyApply extends AdvancedFilterCopyRequest {
  readonly approval?: FilterOverwriteApproval
  readonly expectedRevision: number
  readonly projection: VisibleProjectionRequest
}

export interface AdvancedFilterRangeCommands {
  readonly 'advancedFilter.previewCopy': WorkerCommand<
    AdvancedFilterCopyRequest,
    AdvancedFilterCopyPreview & { readonly revision: number }
  >
  readonly 'advancedFilter.copy': WorkerCommand<
    AdvancedFilterCopyApply,
    AdvancedFilterCopyResult & { readonly projection: VisibleProjectionResult }
  >
}

export interface NativeFilterRangeReference {
  readonly sheet: number
  readonly range: CellRange
}

export interface NativeFilterRangeCriteria {
  readonly criteria?: NativeFilterRangeReference
  readonly uniqueOnly: boolean
}

interface NativeAdvancedFilterCopyRequest extends NativeFilterRangeCriteria {
  readonly source: NativeFilterRangeReference
  readonly sheet: number
  readonly destination: CellCoord
  readonly outputFields?: readonly string[]
  readonly rowCount: number
  readonly colCount: number
}

export interface WasmAdvancedFilterCopy {
  preview_advanced_filter_copy?: (
    request: NativeAdvancedFilterCopyRequest,
  ) => AdvancedFilterCopyPreview
  copy_advanced_filter?: (
    request: NativeAdvancedFilterCopyRequest, approval: FilterOverwriteApproval | undefined,
  ) => AdvancedFilterCopyResult
}
