import type { VisibleProjectionRequest } from '../contracts'
import type { WorkerCommand } from '../rust-worker'
import type { CellRange } from '../shared'
import type { RustWorkbookCommands } from './commands'
import type { StructuralEdit } from './structure-geometry'

export const SUBTOTAL_FUNCTIONS = [
  'average', 'countNumbers', 'count', 'max', 'min', 'product',
  'sampleStandardDeviation', 'populationStandardDeviation', 'sum',
  'sampleVariance', 'populationVariance',
] as const

export type SubtotalFunction = (typeof SUBTOTAL_FUNCTIONS)[number]
export type SubtotalPlacement = 'above' | 'below'

export interface SubtotalSettings {
  readonly groupByColumn: number
  readonly calculation: { readonly function: SubtotalFunction; readonly columns: readonly number[] }
  readonly placement: SubtotalPlacement
  readonly replace: boolean
  readonly totalSuffix: string
  readonly grandTotal: string
}

export type SubtotalAction =
  | { readonly kind: 'apply'; readonly settings: SubtotalSettings }
  | { readonly kind: 'remove' }

interface SubtotalListRequest {
  readonly sheetId: string
  readonly range: CellRange
}

export interface SubtotalList {
  readonly range: CellRange
  readonly fields: readonly { readonly column: number; readonly name: string }[]
  readonly placement?: SubtotalPlacement
  readonly notice?: string
  readonly revision: number
}

export interface SubtotalChangeRequest extends SubtotalListRequest {
  readonly action: SubtotalAction
  readonly expectedRevision: number
  readonly projection: VisibleProjectionRequest
}

export type SubtotalChangeResult = {
  readonly changed: false
} | (RustWorkbookCommands['sheet.editStructure']['result'] & {
  readonly changed: true
  readonly list: CellRange
  readonly edits: readonly StructuralEdit[]
})

export interface RustSubtotalCommands {
  readonly 'subtotal.inspect': WorkerCommand<SubtotalListRequest, SubtotalList>
  readonly 'subtotal.change': WorkerCommand<SubtotalChangeRequest, SubtotalChangeResult>
}

interface NativeSubtotalBounds {
  readonly startRow: number
  readonly endRow: number
  readonly startCol: number
  readonly endCol: number
}

export interface NativeSubtotalListRequest {
  readonly sheet: number
  readonly selection: NativeSubtotalBounds
  readonly rowCount: number
  readonly colCount: number
}

export interface NativeSubtotalList extends Omit<SubtotalList, 'range' | 'revision'> {
  readonly range: NativeSubtotalBounds
}

export interface NativeSubtotalReport {
  readonly range: NativeSubtotalBounds
  readonly edits: readonly StructuralEdit[]
}
