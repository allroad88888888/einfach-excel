// 一句话：通过 UI Core 编辑命令完成 draft、ACK 和投影刷新。

import type { Store } from '@einfach/core'
import {
  editingDraftAtom,
  editingSessionAtom,
  runEditingCommitAtom,
  startEditingAtom,
  type CellCoord,
  type HistoryEntryRecorder,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import type { VanillaEditingProjectionSession, VanillaEditingSession } from './types'

interface VanillaEditingSessionOptions {
  readonly backend: SpreadsheetBackend
  readonly projection: VanillaEditingProjectionSession
  readonly sheetId: string
  readonly store: Store
}

function createHistoryEntryRecorder(backend: SpreadsheetBackend): HistoryEntryRecorder {
  return (entry, append) => {
    if (
      typeof backend.undoTransaction !== 'function' ||
      typeof backend.redoTransaction !== 'function'
    ) {
      return 'unavailable'
    }
    try {
      return append(entry) ? 'recorded' : 'rejected'
    } catch {
      return 'rejected'
    }
  }
}

export function createVanillaEditingSession(
  options: VanillaEditingSessionOptions,
): VanillaEditingSession {
  const historyEntryRecorder = createHistoryEntryRecorder(options.backend)

  return Object.freeze({
    commit: () =>
      options.store.setter(runEditingCommitAtom, {
        source: options.backend,
        commitSource: 'cell',
        move: 'none',
        historyEntryRecorder,
        refreshProjection: options.projection.refresh,
      }),
    start: (cell: CellCoord, draft: string) =>
      options.store.setter(startEditingAtom, {
        sheetId: options.sheetId,
        cell,
        draft,
        source: 'cell',
      }),
    state: () => options.store.getter(editingSessionAtom),
    writeDraft: (draft: string) => {
      options.store.setter(editingDraftAtom, { draft, source: 'cell' })
    },
  })
}
