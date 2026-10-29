import { nextHistoryTransactionId, pushHistoryAtom } from '../history'
import type { HistoryEntry, HistoryEntryRecorder, HistoryRecordResult } from '../history'

/**
 * Push the ONE UI-core history entry that pairs with the ONE adapter
 * transaction record a table definition change produces.
 *
 * The two stacks align POSITIONALLY: `runHistoryTransaction` pops the
 * adapter's top record and binds whatever transaction id the UI entry
 * carries. Recording on one side only offsets them by one, so every later
 * undo reverts a mutation one step older than the UI believes and the
 * oldest record strands when the UI stack empties first. Returns false when
 * the entry could not be pushed (a history ticket is in flight, or the
 * backend returned no parseable revision); callers surface that as
 * `outcome-unknown` rather than leaving a silently skewed stack.
 */
export function captureTableHistoryEntryRecorder(input: {
  readonly historyEntryRecorder: HistoryEntryRecorder
}): HistoryEntryRecorder | null {
  try {
    const recorder = input.historyEntryRecorder
    return typeof recorder === 'function' ? recorder : null
  } catch {
    return null
  }
}

export function recordTableHistory(
  set: (atomToSet: typeof pushHistoryAtom, value: HistoryEntry) => boolean,
  recorder: HistoryEntryRecorder,
  sheetId: string | null,
  revision: number | string | undefined,
): HistoryRecordResult {
  if (revision === undefined) return 'rejected'
  const entry: HistoryEntry = {
    transactionId: nextHistoryTransactionId(),
    kind: 'table.define',
    sheetId,
    projectionRevision: revision,
  }
  try {
    const result = recorder(entry, (nextEntry) => set(pushHistoryAtom, nextEntry))
    return result === 'recorded' || result === 'unavailable' || result === 'rejected'
      ? result
      : 'rejected'
  } catch {
    return 'rejected'
  }
}
