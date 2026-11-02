import type { SheetRef } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 工作表清单和结构变更的数据契约。 */
export interface SpreadsheetSheetMetadata {
  id: string
  name: string
  index: number
}

export interface SheetListResult {
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  sheets: SpreadsheetSheetMetadata[]
}

export interface AddSheetRequest {
  kind: 'add-sheet'
  name?: string
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface RenameSheetRequest extends SheetRef {
  kind: 'rename-sheet'
  name: string
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface DeleteSheetRequest extends SheetRef {
  kind: 'delete-sheet'
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface ReorderSheetRequest extends SheetRef {
  kind: 'reorder-sheet'
  beforeSheetId?: string | null
  afterSheetId?: string | null
  targetIndex?: number | null
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface SheetMutationResult {
  sheetId?: string
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  sheets?: SpreadsheetSheetMetadata[]
  activeSheetId?: string | null
  createdSheet?: SpreadsheetSheetMetadata
}
