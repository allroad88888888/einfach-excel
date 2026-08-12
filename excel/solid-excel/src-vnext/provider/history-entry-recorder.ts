import type { HistoryEntryRecorder, SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'

import { backendSupportsHistory } from './history-dispatch'

/**
 * Create a host capability guard for acknowledged Core history producers.
 *
 * `backend` is expected to be the Provider's stable forwarding proxy. The
 * guard deliberately reads its undo/redo methods at invocation time so a
 * retained recorder follows same-workbook runtime backend replacement.
 */
export function createHistoryEntryRecorder(backend: SpreadsheetBackend): HistoryEntryRecorder {
  return (entry, append) => {
    if (!backendSupportsHistory(backend)) return 'unavailable'
    try {
      return append(entry) ? 'recorded' : 'rejected'
    } catch {
      return 'rejected'
    }
  }
}
