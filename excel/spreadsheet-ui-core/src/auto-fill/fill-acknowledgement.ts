import type { AutoFillMutationResult, ProjectionRevision } from '../backend/types'
import type { CellRange } from '../shared'
import { copyRange, sameRange } from './fill-range-geometry'

export function revisionForHistory(
  revision: ProjectionRevision | undefined,
): ProjectionRevision | null {
  if (
    (typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0) ||
    (typeof revision === 'string' && revision.length > 0)
  ) {
    return revision
  }
  return null
}

export type ExactMutationAcknowledgement =
  | {
      readonly kind: 'applied'
      readonly affectedRange: CellRange
      readonly revision: ProjectionRevision
    }
  | { readonly kind: 'invalid' }

export function classifyExactMutationAcknowledgement(
  value: unknown,
  sheetId: string,
  expectedAffectedRange: Readonly<CellRange>,
): ExactMutationAcknowledgement {
  try {
    if (typeof value !== 'object' || value === null) {
      return { kind: 'invalid' }
    }
    const result = value as Record<string, unknown>
    const resultSheetId = result.sheetId
    const revision = revisionForHistory(result.revision as ProjectionRevision | undefined)
    const affectedRangeValue = result.affectedRange
    if (
      resultSheetId !== sheetId ||
      revision === null ||
      typeof affectedRangeValue !== 'object' ||
      affectedRangeValue === null
    ) {
      return { kind: 'invalid' }
    }
    const affectedRange = copyRange(affectedRangeValue as Readonly<CellRange>)
    if (!sameRange(affectedRange, expectedAffectedRange)) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'applied',
      affectedRange,
      revision,
    }
  } catch {
    return { kind: 'invalid' }
  }
}

export type CompactAutoFillAcknowledgement =
  | {
      readonly kind: 'applied'
      readonly result: Extract<AutoFillMutationResult, { readonly applied: true }>
      readonly revision: ProjectionRevision
    }
  | { readonly kind: 'no-op' }
  | { readonly kind: 'invalid' }

/**
 * Compact fills mirror one backend transaction into one UI history entry.
 * The count and disposition are transaction witnesses, not an undoability
 * shortcut: both `undoable` and `not-undoable` require one positional entry.
 * Missing legacy fields and contradictory combinations are deliberately not
 * guessed because retrying either case could duplicate an already-applied
 * fill.
 */
export function classifyCompactAutoFillAcknowledgement(
  value: unknown,
  sheetId: string,
  expectedAffectedRange: Readonly<CellRange>,
): CompactAutoFillAcknowledgement {
  try {
    if (typeof value !== 'object' || value === null) {
      return { kind: 'invalid' }
    }
    const result = value as Record<string, unknown>
    const structuralShift = result.structuralShift
    if (structuralShift !== undefined) {
      return { kind: 'invalid' }
    }
    const resultSheetId = result.sheetId
    const applied = result.applied
    const historyTransactionCount = result.historyTransactionCount
    const historyDisposition = result.historyDisposition
    const affectedRangeValue = result.affectedRange
    const hasRevision = 'revision' in result
    const revision = revisionForHistory(result.revision as ProjectionRevision | undefined)
    if (
      resultSheetId !== sheetId ||
      typeof applied !== 'boolean' ||
      typeof historyTransactionCount !== 'number' ||
      !Number.isSafeInteger(historyTransactionCount) ||
      (historyTransactionCount !== 0 && historyTransactionCount !== 1) ||
      (historyDisposition !== 'none' &&
        historyDisposition !== 'undoable' &&
        historyDisposition !== 'not-undoable')
    ) {
      return { kind: 'invalid' }
    }
    if (
      applied === false &&
      historyTransactionCount === 0 &&
      historyDisposition === 'none' &&
      affectedRangeValue === undefined
    ) {
      return !hasRevision || revision !== null ? { kind: 'no-op' } : { kind: 'invalid' }
    }
    if (
      applied !== true ||
      historyTransactionCount !== 1 ||
      (historyDisposition !== 'undoable' && historyDisposition !== 'not-undoable') ||
      typeof affectedRangeValue !== 'object' ||
      affectedRangeValue === null
    ) {
      return { kind: 'invalid' }
    }
    const affectedRange = copyRange(affectedRangeValue as Readonly<CellRange>)
    if (!sameRange(affectedRange, expectedAffectedRange) || revision === null) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'applied',
      result: {
        sheetId,
        applied: true,
        historyTransactionCount: 1,
        historyDisposition,
        revision,
        affectedRange,
      },
      revision,
    }
  } catch {
    return { kind: 'invalid' }
  }
}
