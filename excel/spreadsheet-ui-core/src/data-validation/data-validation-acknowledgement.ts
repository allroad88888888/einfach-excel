import type { DataValidationMutationAcknowledgement } from './types'
import type { DataValidationMutationAuthority } from './data-validation-mutation-ledger'
import type { CellRange } from '../shared'
import { freezeRange, isObjectRecord, sameRange, snapshotRange } from './data-validation-value'

export function snapshotAcknowledgement(
  value: unknown,
  authority: DataValidationMutationAuthority,
): { acknowledgement: DataValidationMutationAcknowledgement | null; error: string | null } {
  if (!isObjectRecord(value)) {
    return { acknowledgement: null, error: 'Data validation acknowledgement must be an object' }
  }
  try {
    const { sheetId, requestId, affectedRange: affectedRangeValue, revision } = value
    if (typeof sheetId !== 'string' || sheetId !== authority.sheetId) {
      return {
        acknowledgement: null,
        error: 'Data validation acknowledgement targeted a different sheet',
      }
    }
    if (
      typeof requestId !== 'number' ||
      !Number.isSafeInteger(requestId) ||
      requestId !== authority.requestId
    ) {
      return {
        acknowledgement: null,
        error: 'Data validation acknowledgement returned a different request id',
      }
    }
    let affectedRange: Readonly<CellRange> | undefined
    if (affectedRangeValue !== undefined) {
      const range = snapshotRange(affectedRangeValue)
      if (range === null || !sameRange(range, authority.range)) {
        return {
          acknowledgement: null,
          error: 'Data validation acknowledgement targeted a different range',
        }
      }
      affectedRange = freezeRange(range)
    }
    if (
      revision !== undefined &&
      typeof revision !== 'string' &&
      (typeof revision !== 'number' || !Number.isFinite(revision))
    ) {
      return {
        acknowledgement: null,
        error: 'Data validation acknowledgement returned an invalid revision',
      }
    }
    return {
      acknowledgement: Object.freeze({
        sheetId,
        requestId,
        ...(affectedRange === undefined ? {} : { affectedRange }),
        ...(revision === undefined ? {} : { revision }),
      }),
      error: null,
    }
  } catch {
    return {
      acknowledgement: null,
      error: 'Data validation acknowledgement could not be read safely',
    }
  }
}
