import type { CellRange, SheetRef } from '../shared'
import type { DisplayCellRichValue } from '../rich-types/types'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 单元格内容变更的数据契约。 */
export interface SetCellInputRequest extends SheetRef {
  kind: 'set-cell-input'
  row: number
  col: number
  input: string
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface SetCellRichValueRequest extends SheetRef {
  kind: 'set-cell-rich-value'
  row: number
  col: number
  value: DisplayCellRichValue
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface ImportCellInput {
  row: number
  col: number
  input: string
  /**
   * When true, the adapter MUST insert `input` as a literal string without
   * numeric inference or formula parsing. A leading `=` is preserved as
   * literal text and digit-only strings like `00123` keep their leading
   * zeros. Used by Text to Columns when the user picks the `text` column
   * format.
   */
  preserveAsText?: boolean
}

export type ImportCellChunkSource =
  | Iterable<readonly ImportCellInput[]>
  | AsyncIterable<readonly ImportCellInput[]>

export interface ImportCellsRequest extends SheetRef {
  kind: 'import-cells'
  cells: ImportCellInput[]
  range?: CellRange
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  cellsPerChunk?: number
}

export interface ImportCellChunksRequest extends SheetRef {
  kind: 'import-cell-chunks'
  chunks: ImportCellChunkSource
  range?: CellRange
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  cellsPerChunk?: number
}

export type ClearRangeTarget = 'values' | 'formats' | 'all'

export interface ClearRangeRequest extends SheetRef {
  kind: 'clear-range'
  range: CellRange
  /** Defaults to 'all' when omitted. */
  target?: ClearRangeTarget
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}
