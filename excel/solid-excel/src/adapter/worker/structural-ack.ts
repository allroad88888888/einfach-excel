// 一句话：结构性行列变更的 ACK 组装。

import type {
  BackendMutationResult,
  DeleteColumnsRequest,
  DeleteRowsRequest,
  InsertColumnsRequest,
  InsertRowsRequest,
  ProjectionRevision,
} from '@einfach/spreadsheet-ui-core'

export function structuralMutationResult(
  request: InsertRowsRequest | DeleteRowsRequest | InsertColumnsRequest | DeleteColumnsRequest,
  revision: ProjectionRevision,
): BackendMutationResult {
  // W3 structural-shift contract: the worker engine really displaced
  // index space, so the ACK must say so — UI-core uses it to remap its
  // canonical view facts (freeze band, hidden index sets) and to record
  // history side payloads for the displaced facts.
  const structuralShift: BackendMutationResult['structuralShift'] =
    request.kind === 'insert-rows'
      ? { axis: 'row', kind: 'insert', index: request.rowIndex, count: request.count }
      : request.kind === 'delete-rows'
        ? { axis: 'row', kind: 'delete', index: request.rowIndex, count: request.count }
        : request.kind === 'insert-columns'
          ? { axis: 'column', kind: 'insert', index: request.colIndex, count: request.count }
          : { axis: 'column', kind: 'delete', index: request.colIndex, count: request.count }
  return {
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? revision,
    structuralShift,
  }
}
