import type { VisibleProjectionRequest, VisibleProjectionResult } from '../contracts'
import type { WorkerCommand } from '../rust-worker'
import type { CellCoord, CellRange } from '../shared'

export const CONSOLIDATE_FUNCTIONS = [
  'sum',
  'count',
  'average',
  'max',
  'min',
  'product',
  'countNumbers',
  'sampleStandardDeviation',
  'populationStandardDeviation',
  'sampleVariance',
  'populationVariance',
] as const

export type ConsolidateFunction = (typeof CONSOLIDATE_FUNCTIONS)[number]

export interface ConsolidateSourceRef {
  readonly sheetId: string
  readonly range: CellRange
}

export interface ConsolidateRequest {
  readonly function: ConsolidateFunction
  readonly sources: readonly ConsolidateSourceRef[]
  readonly sheetId: string
  readonly destination: CellCoord
  readonly topRow: boolean
  readonly leftColumn: boolean
  readonly createLinks: boolean
}

export interface ConsolidateOverwriteApproval {
  readonly target: CellRange
  readonly count: number
}

export interface ConsolidatePreview {
  readonly target: CellRange
  readonly rowCount: number
  readonly colCount: number
  readonly overwrittenCells: number
  readonly sample: readonly (readonly string[])[]
  readonly sampleTruncated: boolean
}

export interface ConsolidateReport {
  readonly target: CellRange
  readonly changedCells: number
  readonly linkedGroups: number
}

export interface ConsolidateApplyRequest extends ConsolidateRequest {
  readonly approval?: ConsolidateOverwriteApproval
  readonly expectedRevision: number
  readonly projection: VisibleProjectionRequest
}

export interface RustConsolidateCommands {
  readonly 'consolidate.preview': WorkerCommand<
    ConsolidateRequest,
    ConsolidatePreview & { readonly revision: number }
  >
  readonly 'consolidate.apply': WorkerCommand<
    ConsolidateApplyRequest,
    ConsolidateReport & { readonly projection: VisibleProjectionResult }
  >
}

interface NativeConsolidateSource {
  readonly sheet: number
  readonly range: CellRange
}

interface NativeConsolidateRequest {
  readonly function: ConsolidateFunction
  readonly sources: readonly NativeConsolidateSource[]
  readonly sheet: number
  readonly destination: CellCoord
  readonly topRow: boolean
  readonly leftColumn: boolean
  readonly createLinks: boolean
  readonly rowCount: number
  readonly colCount: number
}

export interface WasmConsolidate {
  preview_consolidate?: (request: NativeConsolidateRequest) => ConsolidatePreview
  apply_consolidate?: (
    request: NativeConsolidateRequest,
    approval: ConsolidateOverwriteApproval | undefined,
  ) => ConsolidateReport
}
