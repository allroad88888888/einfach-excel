import type { CellCoord, SheetRef } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** Ctrl+方向键数据边界查询的数据契约。 */
export type SpreadsheetDataEdgeDirection = 'up' | 'down' | 'left' | 'right'

export interface ResolveDataEdgeRequest extends SheetRef {
  kind: 'resolve-data-edge'
  from: CellCoord
  direction: SpreadsheetDataEdgeDirection
  bounds: {
    rowCount: number
    colCount: number
  }
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface ResolveDataEdgeResult extends SheetRef {
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  target: CellCoord
}
