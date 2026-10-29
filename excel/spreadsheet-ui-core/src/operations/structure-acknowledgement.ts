import type {
  BackendMutationResult,
  BackendStructuralShift,
  ProjectionRevision,
} from '../backend/types'
import type { CellRange } from '../shared'
import type { StructureOperationTicket } from './structure-lifecycle'
import { isProjectionRevision } from './structure-request'

export interface StructureOperationAcknowledgement {
  readonly revision: ProjectionRevision
  readonly affectedRange?: Readonly<CellRange>
  readonly structuralShift?: Readonly<BackendStructuralShift>
}

export function acknowledgedStructureOperation(
  value: unknown,
  ticket: StructureOperationTicket,
): StructureOperationAcknowledgement | null {
  try {
    if (typeof value !== 'object' || value === null) return null
    const result = value as Partial<BackendMutationResult>
    const sheetId = result.sheetId
    const requestId = result.requestId
    const revision = result.revision
    const affectedRangeValue = result.affectedRange
    const structuralShiftValue = result.structuralShift
    if (
      sheetId !== ticket.intent.sheetId ||
      requestId !== ticket.requestId ||
      !isProjectionRevision(revision)
    ) {
      return null
    }

    const affectedRange = snapshotAffectedRange(affectedRangeValue)
    const structuralShift = snapshotStructuralShift(structuralShiftValue)
    if (
      (affectedRangeValue !== undefined && affectedRange === null) ||
      (structuralShiftValue !== undefined && structuralShift === null)
    ) {
      return null
    }
    const acknowledgement: {
      revision: ProjectionRevision
      affectedRange?: Readonly<CellRange>
      structuralShift?: Readonly<BackendStructuralShift>
    } = { revision }
    if (affectedRange !== null) acknowledgement.affectedRange = affectedRange
    if (structuralShift !== null) acknowledgement.structuralShift = structuralShift
    return Object.freeze(acknowledgement)
  } catch {
    return null
  }
}

export function snapshotStructuralShift(value: unknown): Readonly<BackendStructuralShift> | null {
  try {
    if (typeof value !== 'object' || value === null) return null
    const shift = value as Partial<BackendStructuralShift>
    const axis = shift.axis
    const kind = shift.kind
    const index = shift.index
    const count = shift.count
    if (
      (axis !== 'row' && axis !== 'column') ||
      (kind !== 'insert' && kind !== 'delete') ||
      typeof index !== 'number' ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count <= 0
    ) {
      return null
    }
    return Object.freeze({ axis, kind, index, count })
  } catch {
    return null
  }
}

export function snapshotAffectedRange(value: unknown): Readonly<CellRange> | null {
  try {
    if (typeof value !== 'object' || value === null) return null
    const range = value as Partial<CellRange>
    const rowStart = range.rowStart
    const rowEnd = range.rowEnd
    const colStart = range.colStart
    const colEnd = range.colEnd
    if (
      typeof rowStart !== 'number' ||
      !Number.isInteger(rowStart) ||
      typeof rowEnd !== 'number' ||
      !Number.isInteger(rowEnd) ||
      typeof colStart !== 'number' ||
      !Number.isInteger(colStart) ||
      typeof colEnd !== 'number' ||
      !Number.isInteger(colEnd) ||
      rowStart < 0 ||
      colStart < 0 ||
      rowEnd < rowStart ||
      colEnd < colStart
    ) {
      return null
    }
    return Object.freeze({ rowStart, rowEnd, colStart, colEnd })
  } catch {
    return null
  }
}
