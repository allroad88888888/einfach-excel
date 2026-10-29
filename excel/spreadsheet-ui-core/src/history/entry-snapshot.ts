import type { HistoryEntry, HistoryEntryKind } from './types'
import { isProjectionRevision } from './identity'

const MAX_HISTORY_SIDE_PAYLOADS = 64
const HISTORY_ENTRY_KINDS: readonly HistoryEntryKind[] = Object.freeze([
  'cell.set-input',
  'cells.import',
  'range.clear',
  'range.fill',
  'range.merge',
  'range.unmerge',
  'range.sort',
  'row.insert',
  'row.delete',
  'column.insert',
  'column.delete',
  'sheet.add',
  'sheet.delete',
  'sheet.rename',
  'sheet.reorder',
  'format.set',
  'viewport.freeze',
  'viewport.hidden',
  'outline',
  'table.define',
  'filter.set',
])

function snapshotAffectedRange(value: unknown): HistoryEntry['affectedRange'] | null {
  if (typeof value !== 'object' || value === null) return null
  const range = value as Record<string, unknown>
  const rowStart = range.rowStart
  const rowEnd = range.rowEnd
  const colStart = range.colStart
  const colEnd = range.colEnd
  if (
    !Number.isSafeInteger(rowStart) ||
    !Number.isSafeInteger(rowEnd) ||
    !Number.isSafeInteger(colStart) ||
    !Number.isSafeInteger(colEnd) ||
    (rowStart as number) < 0 ||
    (rowEnd as number) < (rowStart as number) ||
    (colStart as number) < 0 ||
    (colEnd as number) < (colStart as number)
  ) {
    return null
  }
  return Object.freeze({
    rowStart: rowStart as number,
    rowEnd: rowEnd as number,
    colStart: colStart as number,
    colEnd: colEnd as number,
  })
}

function snapshotLocalReplayPayload(
  value: unknown,
): NonNullable<HistoryEntry['localReplay']> | null {
  if (typeof value !== 'object' || value === null) return null
  const payload = value as Record<string, unknown>
  const applyKey = payload.applyKey
  const sheetId = payload.sheetId
  const before = payload.before
  const after = payload.after
  if (
    typeof applyKey !== 'string' ||
    applyKey.length === 0 ||
    typeof sheetId !== 'string' ||
    sheetId.length === 0
  ) {
    return null
  }
  return Object.freeze({ applyKey, sheetId, before, after })
}

function isHistoryEntryKind(value: unknown): value is HistoryEntryKind {
  return typeof value === 'string' && HISTORY_ENTRY_KINDS.includes(value as HistoryEntryKind)
}

/**
 * Snapshot the public descriptor boundary once. Every supported caller field
 * is read exactly once; malformed or throwing objects fail closed without
 * leaking a partial descriptor into the bounded stack.
 */
export function snapshotEntry(entry: HistoryEntry): HistoryEntry | null {
  try {
    const transactionId = entry.transactionId
    const kind = entry.kind
    const sheetId = entry.sheetId
    const projectionRevision = entry.projectionRevision
    const affectedRangeValue = entry.affectedRange
    const localReplayValue = entry.localReplay
    const localSidePayloadsValue = entry.localSidePayloads

    if (
      typeof transactionId !== 'string' ||
      transactionId.length === 0 ||
      !isHistoryEntryKind(kind) ||
      (sheetId !== null && (typeof sheetId !== 'string' || sheetId.length === 0)) ||
      !isProjectionRevision(projectionRevision)
    ) {
      return null
    }

    let affectedRange: HistoryEntry['affectedRange']
    if (affectedRangeValue !== undefined) {
      affectedRange = snapshotAffectedRange(affectedRangeValue) ?? undefined
      if (affectedRange === undefined) return null
    }

    let localReplay: HistoryEntry['localReplay']
    if (localReplayValue !== undefined) {
      localReplay = snapshotLocalReplayPayload(localReplayValue) ?? undefined
      if (localReplay === undefined) return null
    }

    let localSidePayloads: HistoryEntry['localSidePayloads']
    if (!localReplay && localSidePayloadsValue !== undefined) {
      if (!Array.isArray(localSidePayloadsValue)) return null
      const length = localSidePayloadsValue.length
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_HISTORY_SIDE_PAYLOADS) {
        return null
      }
      if (length > 0) {
        const snapshots: NonNullable<HistoryEntry['localReplay']>[] = []
        for (let index = 0; index < length; index += 1) {
          const payloadValue = localSidePayloadsValue[index]
          const payload = snapshotLocalReplayPayload(payloadValue)
          if (payload === null) return null
          snapshots.push(payload)
        }
        localSidePayloads = Object.freeze(snapshots)
      }
    }

    return Object.freeze({
      transactionId,
      kind,
      sheetId,
      projectionRevision,
      ...(affectedRange ? { affectedRange } : {}),
      ...(localReplay ? { localReplay } : {}),
      ...(localSidePayloads ? { localSidePayloads } : {}),
    })
  } catch {
    return null
  }
}
