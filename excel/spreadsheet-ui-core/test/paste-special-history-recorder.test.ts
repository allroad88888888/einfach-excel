import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import { copyClipboardAtom } from '../src/clipboard'
import {
  acquireHistoryProducerReservationAtom,
  historyStackAtom,
  pushReservedHistoryAtom,
  releaseHistoryProducerReservationAtom,
  type HistoryEntryRecorder,
} from '../src/history'
import {
  capturePasteSpecialCapabilityAtom,
  confirmPasteSpecialAtom,
  openPasteSpecialAtom,
  pasteSpecialLifecycleAtom,
  pasteSpecialOpenAtom,
  pasteSpecialSessionAtom,
  type ConfirmPasteSpecialInput,
  type PasteRangeRequest,
  type PasteRangeResult,
  type PasteSpecialControllerPort,
} from '../src/paste-special'
import { selectionAtom } from '../src/selection'
import { setWorkspaceActiveSheetAtom } from '../src/workspace'

const sheetId = 'sheet-1'

function result(request: PasteRangeRequest): PasteRangeResult {
  return {
    kind: 'paste-range',
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: 7,
    affectedRange: request.target,
  }
}

function createReadyStore(source: PasteSpecialControllerPort) {
  const store = createStore()
  store.setter(setWorkspaceActiveSheetAtom, { sheetId })
  store.setter(selectionAtom, {
    kind: 'range',
    sheetId,
    anchor: { row: 4, col: 2 },
    focus: { row: 5, col: 3 },
  })
  store.setter(copyClipboardAtom, {
    source: {
      sheetId: 'source-sheet',
      range: { rowStart: 1, rowEnd: 2, colStart: 0, colEnd: 1 },
    },
    includesFormulas: true,
    estimatedBytes: 64,
  })
  store.setter(capturePasteSpecialCapabilityAtom, source)
  store.setter(openPasteSpecialAtom)
  const session = store.getter(pasteSpecialSessionAtom)
  if (session === null) throw new Error('expected an open Paste Special session')
  return { session, store }
}

function createInput(
  source: PasteSpecialControllerPort,
  sessionId: number,
  historyEntryRecorder: HistoryEntryRecorder,
  refreshProjection: () => Promise<void>,
): ConfirmPasteSpecialInput {
  return {
    source,
    sessionId,
    historyEntryRecorder,
    refreshProjection: async () => refreshProjection(),
  }
}

function expectHistoryLaneAvailable(store: ReturnType<typeof createStore>): void {
  const reservation = store.setter(acquireHistoryProducerReservationAtom)
  expect(reservation).not.toBeNull()
  if (reservation !== null) {
    expect(store.setter(releaseHistoryProducerReservationAtom, reservation)).toBe(true)
  }
}

describe('Paste Special history recorder', () => {
  test.each([
    [
      'full',
      ((entry, append) => (append(entry) ? 'recorded' : 'rejected')) as HistoryEntryRecorder,
      1,
    ],
    ['unavailable', (() => 'unavailable') as HistoryEntryRecorder, 0],
  ])(
    '%s keeps an ACKed paste successful and refreshes exactly once',
    async (_capability, recorder, entries) => {
      let pastes = 0
      let refreshes = 0
      const source: PasteSpecialControllerPort = {
        async pasteRange(request) {
          pastes += 1
          return result(request)
        },
      }
      const { session, store } = createReadyStore(source)

      await expect(
        store.setter(
          confirmPasteSpecialAtom,
          createInput(source, session.sessionId, recorder, async () => {
            refreshes += 1
          }),
        ),
      ).resolves.toBe('completed')

      expect({ pastes, refreshes }).toEqual({ pastes: 1, refreshes: 1 })
      expect(store.getter(historyStackAtom).entries).toHaveLength(entries)
      expect(store.getter(pasteSpecialOpenAtom)).toBe(false)
      expectHistoryLaneAvailable(store)
    },
  )

  test('a rejected reserved append remains outcome-unknown and never refreshes or resends', async () => {
    let pastes = 0
    let refreshes = 0
    const source: PasteSpecialControllerPort = {
      async pasteRange(request) {
        pastes += 1
        return result(request)
      },
    }
    const recorder: HistoryEntryRecorder = (entry, append) =>
      append(entry) ? 'recorded' : 'rejected'
    const { session, store } = createReadyStore(source)
    const input = createInput(source, session.sessionId, recorder, async () => {
      refreshes += 1
    })
    const originalWrite = pushReservedHistoryAtom.write
    pushReservedHistoryAtom.write = () => false
    try {
      await expect(store.setter(confirmPasteSpecialAtom, input)).resolves.toBe('outcome-unknown')
    } finally {
      pushReservedHistoryAtom.write = originalWrite
    }

    expect({ pastes, refreshes }).toEqual({ pastes: 1, refreshes: 0 })
    expect(store.getter(historyStackAtom).entries).toEqual([])
    expect(store.getter(pasteSpecialLifecycleAtom).status).toBe('outcome-unknown')
    expect(store.setter(acquireHistoryProducerReservationAtom)).toBeNull()
    await expect(store.setter(confirmPasteSpecialAtom, input)).resolves.toBe('blocked')
    expect(pastes).toBe(1)
  })
})
