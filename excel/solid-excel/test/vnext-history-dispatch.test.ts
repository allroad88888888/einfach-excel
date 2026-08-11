import { describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import {
  historyStackAtom,
  type HistoryEntry,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { backendSupportsHistory, recordHistoryEntry } from '../src-vnext/provider/history-dispatch'

function createBackend(overrides: Partial<SpreadsheetBackend> = {}): SpreadsheetBackend {
  return {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
    ...overrides,
  }
}

function entry(): HistoryEntry {
  return {
    transactionId: 'tx-1',
    kind: 'cell.set-input',
    sheetId: 'sheet-1',
    projectionRevision: 1,
  }
}

describe('history dispatch capability ownership', () => {
  it('does not publish a replay promise unless both transaction ports exist', () => {
    const store = createStore()
    const undoOnly = createBackend({
      async undoTransaction(request) {
        return { transactionId: request.transactionId, requestId: request.requestId, revision: 2 }
      },
    })

    expect(backendSupportsHistory(undoOnly)).toBe(false)
    expect(recordHistoryEntry(store, undoOnly, entry())).toBe(false)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })

  it('records only transactions that have a complete undo and redo contract', () => {
    const store = createStore()
    const backend = createBackend({
      async undoTransaction(request) {
        return { transactionId: request.transactionId, requestId: request.requestId, revision: 2 }
      },
      async redoTransaction(request) {
        return { transactionId: request.transactionId, requestId: request.requestId, revision: 3 }
      },
    })

    expect(backendSupportsHistory(backend)).toBe(true)
    expect(recordHistoryEntry(store, backend, entry())).toBe(true)
    expect(store.getter(historyStackAtom)).toMatchObject({ cursor: 1, entries: [entry()] })
  })
})
