import { createStore } from '@einfach/core'
import { describe, expect, it } from 'vitest'
import {
  capturePasteSpecialCapabilityAtom,
  confirmPasteSpecialAtom,
  copyClipboardAtom,
  historyStackAtom,
  openPasteSpecialAtom,
  pasteSpecialSessionAtom,
  selectionAtom,
  setWorkspaceActiveSheetAtom,
  type PasteRangeRequest,
  type PasteRangeResult,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { createSpreadsheetBackendHandle } from '../src/provider/backend-handle'
import { createHistoryEntryRecorder } from '../src/provider/history-entry-recorder'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function createBackend(
  pasteRange: NonNullable<SpreadsheetBackend['pasteRange']>,
  supportsHistory: boolean,
): SpreadsheetBackend {
  const backend: SpreadsheetBackend = {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
    pasteRange,
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

describe('Paste Special history recorder host integration', () => {
  it('keeps an ACKed paste and refresh successful when the stable backend loses history before ACK', async () => {
    const acknowledgement = deferred<PasteRangeResult>()
    let request: PasteRangeRequest | null = null
    let refreshes = 0
    const handle = createSpreadsheetBackendHandle(
      createBackend(async (nextRequest) => {
        request = nextRequest
        return acknowledgement.promise
      }, true),
    )
    const store = createStore()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(selectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 2, col: 3 },
      focus: { row: 2, col: 3 },
    })
    store.setter(copyClipboardAtom, {
      source: {
        sheetId: 'source-sheet',
        range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
      },
      includesFormulas: false,
      estimatedBytes: 1,
    })
    store.setter(capturePasteSpecialCapabilityAtom, handle.backend)
    store.setter(openPasteSpecialAtom)
    const session = store.getter(pasteSpecialSessionAtom)
    if (session === null) throw new Error('expected an open Paste Special session')

    const operation = store.setter(confirmPasteSpecialAtom, {
      source: handle.backend,
      sessionId: session.sessionId,
      historyEntryRecorder: createHistoryEntryRecorder(handle.backend),
      refreshProjection: async () => {
        refreshes += 1
      },
    })
    await flushMicrotasks()
    const acknowledgedRequest = request as PasteRangeRequest | null
    if (acknowledgedRequest === null) throw new Error('expected Paste Special request')

    handle.replace(
      createBackend(async () => {
        throw new Error('the captured mutation must not be reissued')
      }, false),
    )
    acknowledgement.resolve({
      kind: 'paste-range',
      sheetId: acknowledgedRequest.sheetId,
      requestId: acknowledgedRequest.requestId,
      revision: 12,
      affectedRange: acknowledgedRequest.target,
    })

    await expect(operation).resolves.toBe('completed')
    expect(refreshes).toBe(1)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })
})
