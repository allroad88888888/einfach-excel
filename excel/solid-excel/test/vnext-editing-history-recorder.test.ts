import { createStore } from '@einfach/core'
import { describe, expect, it } from '@jest/globals'
import {
  historyStackAtom,
  runEditingCommitAtom,
  startEditingAtom,
  type EditingCommitAcknowledgement,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { createSpreadsheetBackendHandle } from '../src-vnext/provider/backend-handle'
import { createHistoryEntryRecorder } from '../src-vnext/provider/history-entry-recorder'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function createBackend(
  setCellInput: SpreadsheetBackend['setCellInput'],
  supportsHistory: boolean,
): SpreadsheetBackend {
  const backend: SpreadsheetBackend = {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    setCellInput,
  }
  if (supportsHistory) {
    backend.undoTransaction = async (request) => ({ transactionId: request.transactionId })
    backend.redoTransaction = async (request) => ({ transactionId: request.transactionId })
  }
  return backend
}

async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve()
}

describe('editing history recorder host integration', () => {
  it('keeps an ACKed edit and projection refresh successful when the same workbook loses history before ACK', async () => {
    const acknowledgement = deferred<EditingCommitAcknowledgement>()
    let requestId: number | null = null
    let refreshes = 0
    const initial = createBackend(async (request) => {
      if (request.requestId === undefined) throw new Error('expected editing request id')
      requestId = request.requestId
      return acknowledgement.promise
    }, true)
    const handle = createSpreadsheetBackendHandle(initial)
    const store = createStore()
    store.setter(startEditingAtom, {
      sheetId: 'sheet-1',
      cell: { row: 2, col: 3 },
      draft: '=A1+1',
      source: 'cell',
    })

    const operation = store.setter(runEditingCommitAtom, {
      source: handle.backend,
      historyEntryRecorder: createHistoryEntryRecorder(handle.backend),
      refreshProjection: async () => {
        refreshes += 1
      },
    })
    await flushMicrotasks()
    expect(requestId).not.toBeNull()

    handle.replace(
      createBackend(async () => {
        throw new Error('the captured mutation must not be reissued')
      }, false),
    )
    acknowledgement.resolve({ sheetId: 'sheet-1', requestId: requestId!, revision: 12 })

    await expect(operation).resolves.toBe('completed')
    expect(refreshes).toBe(1)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })
})
