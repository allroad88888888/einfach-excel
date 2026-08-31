// 一句话：把请求与当前 revision 组装成后端 ACK。

import type {
  BackendMutationResult,
  BackendStructuralShift,
  CellRange,
  DeleteColumnsRequest,
  DeleteRowsRequest,
  InsertColumnsRequest,
  InsertRowsRequest,
  MergeRangeRequest,
  ProjectionRevision,
  SheetMutationResult,
  TableMutationRejectedResult,
  TableMutationRejectionCode,
  UnmergeRangeRequest,
} from '@einfach/spreadsheet-ui-core'
import { cloneRange, normalizeRange } from '@einfach/spreadsheet-ui-core'
import { cloneSheets } from './sheet-metadata'
import type { StaticBackendState } from './state'

export function sheetMutationResult(
  state: StaticBackendState,
  requestId: number | undefined,
  extra: Partial<SheetMutationResult> = {},
): SheetMutationResult {
  const { revision: resultRevision, ...rest } = extra
  return {
    ...rest,
    requestId,
    revision: resultRevision ?? state.revision,
    sheets: cloneSheets(state.sheets),
  }
}

export function mutationResult(
  request: {
    sheetId: string
    requestId?: number
    revision?: ProjectionRevision
  },
  revision: ProjectionRevision,
  affectedRange?: CellRange,
): BackendMutationResult {
  return {
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? revision,
    ...(affectedRange ? { affectedRange: cloneRange(normalizeRange(affectedRange)) } : {}),
  }
}

export function structuralMutationResult(
  request: InsertRowsRequest | DeleteRowsRequest | InsertColumnsRequest | DeleteColumnsRequest,
  revision: ProjectionRevision,
): BackendMutationResult {
  const structuralShift: BackendStructuralShift =
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

export function mergeMutationResult(
  request: MergeRangeRequest | UnmergeRangeRequest,
  revision: ProjectionRevision,
) {
  return {
    kind: request.kind,
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? revision,
    affectedRange: cloneRange(normalizeRange(request.range)),
  }
}

export function tableRejected(
  state: StaticBackendState,
  request: { requestId?: number; revision?: ProjectionRevision },
  code: TableMutationRejectionCode,
  message?: string,
): TableMutationRejectedResult {
  return {
    kind: 'table-mutation-not-applied',
    applied: false,
    code,
    ...(message ? { message } : {}),
    requestId: request.requestId,
    // A rejected mutation never bumps: echo the current (un-bumped) witness.
    revision: request.revision ?? state.revision,
  }
}
