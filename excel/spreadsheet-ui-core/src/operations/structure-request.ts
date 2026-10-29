import type {
  BackendMutationResult,
  ProjectionRequestId,
  ProjectionRevision,
} from '../backend/types'
import type {
  StructureOperationControllerPort,
  StructureOperationIntent,
  StructureOperationRequest,
} from './structure-contract'

export type StructureOperationExecutor = (
  request: StructureOperationRequest,
) => Promise<BackendMutationResult>

export function isProjectionRevision(value: unknown): value is ProjectionRevision {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length > 0)
  )
}

export function snapshotStructureOperationIntent(value: unknown): StructureOperationIntent | null {
  try {
    if (typeof value !== 'object' || value === null) return null
    const input = value as Partial<StructureOperationIntent>
    if (typeof input.sheetId !== 'string' || input.sheetId.length === 0) return null
    if (input.revision !== undefined && !isProjectionRevision(input.revision)) return null

    switch (input.kind) {
      case 'row.insert':
      case 'row.delete':
        if (
          typeof input.rowIndex !== 'number' ||
          !Number.isInteger(input.rowIndex) ||
          input.rowIndex < 0 ||
          typeof input.count !== 'number' ||
          !Number.isInteger(input.count) ||
          input.count < 1
        ) {
          return null
        }
        return Object.freeze({
          kind: input.kind,
          sheetId: input.sheetId,
          rowIndex: input.rowIndex,
          count: input.count,
          source: input.source,
          revision: input.revision,
        })
      case 'column.insert':
      case 'column.delete':
        if (
          typeof input.colIndex !== 'number' ||
          !Number.isInteger(input.colIndex) ||
          input.colIndex < 0 ||
          typeof input.count !== 'number' ||
          !Number.isInteger(input.count) ||
          input.count < 1
        ) {
          return null
        }
        return Object.freeze({
          kind: input.kind,
          sheetId: input.sheetId,
          colIndex: input.colIndex,
          count: input.count,
          source: input.source,
          revision: input.revision,
        })
      default:
        return null
    }
  } catch {
    return null
  }
}

export function nextStructureOperationRequestId(sequence: number): ProjectionRequestId | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) {
    return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  }
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

export function buildStructureOperationRequest(
  intent: StructureOperationIntent,
  requestId: ProjectionRequestId,
): StructureOperationRequest {
  switch (intent.kind) {
    case 'row.insert':
      return Object.freeze({
        kind: 'insert-rows',
        sheetId: intent.sheetId,
        rowIndex: intent.rowIndex,
        count: intent.count,
        requestId,
        revision: intent.revision,
      })
    case 'row.delete':
      return Object.freeze({
        kind: 'delete-rows',
        sheetId: intent.sheetId,
        rowIndex: intent.rowIndex,
        count: intent.count,
        requestId,
        revision: intent.revision,
      })
    case 'column.insert':
      return Object.freeze({
        kind: 'insert-columns',
        sheetId: intent.sheetId,
        colIndex: intent.colIndex,
        count: intent.count,
        requestId,
        revision: intent.revision,
      })
    case 'column.delete':
      return Object.freeze({
        kind: 'delete-columns',
        sheetId: intent.sheetId,
        colIndex: intent.colIndex,
        count: intent.count,
        requestId,
        revision: intent.revision,
      })
  }
}

export function structureOperationExecutor(
  source: StructureOperationControllerPort,
  kind: StructureOperationIntent['kind'],
): StructureOperationExecutor | null {
  try {
    const execute =
      kind === 'row.insert'
        ? source.insertRows
        : kind === 'row.delete'
          ? source.deleteRows
          : kind === 'column.insert'
            ? source.insertColumns
            : source.deleteColumns
    return typeof execute === 'function' ? (execute as unknown as StructureOperationExecutor) : null
  } catch {
    return null
  }
}
