import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import type { BackendMutationResult, ImportCellChunksRequest } from '../src/backend/types'
import {
  acquireHistoryProducerReservationAtom,
  historyStackAtom,
  pushHistoryAtom,
  releaseHistoryProducerReservationAtom,
  type HistoryEntryRecorder,
} from '../src/history'
import {
  captureTextToColumnsCapabilityAtom,
  dispatchTextToColumnsIntentAtom,
  openTextToColumnsAtom,
  runTextToColumnsFinishAtom,
  textToColumnsLifecycleAtom,
  textToColumnsOpenAtom,
  type RunTextToColumnsFinishInput,
  type TextToColumnsControllerPort,
} from '../src/text-to-columns'

const sheetId = 'sheet-1'

function acknowledgement(request: ImportCellChunksRequest): BackendMutationResult {
  if (request.requestId === undefined || request.range === undefined) {
    throw new Error('expected identity and target')
  }
  return {
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: 7,
    affectedRange: request.range,
  }
}

function createReadyStore() {
  const store = createStore()
  const sessionId = store.setter(openTextToColumnsAtom, {
    sheetId,
    anchor: { row: 2, col: 4 },
    rows: [
      { sourceRow: 2, text: 'a,b' },
      { sourceRow: 3, text: 'c,d' },
    ],
  })
  if (sessionId === null) throw new Error('expected a Text to Columns session')
  expect(store.setter(dispatchTextToColumnsIntentAtom, { kind: 'next' })).toBe(true)
  expect(
    store.setter(dispatchTextToColumnsIntentAtom, { kind: 'toggle-delimiter', delimiter: 'tab' }),
  ).toBe(true)
  expect(
    store.setter(dispatchTextToColumnsIntentAtom, { kind: 'toggle-delimiter', delimiter: 'comma' }),
  ).toBe(true)
  expect(store.setter(dispatchTextToColumnsIntentAtom, { kind: 'next' })).toBe(true)
  return { sessionId, store }
}

function createInput(
  source: TextToColumnsControllerPort,
  sessionId: number,
  historyEntryRecorder: HistoryEntryRecorder,
  refreshProjection: () => Promise<void>,
): RunTextToColumnsFinishInput {
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

describe('Text to Columns history recorder', () => {
  test.each([
    [
      'full',
      ((entry, append) => (append(entry) ? 'recorded' : 'rejected')) as HistoryEntryRecorder,
      1,
    ],
    ['unavailable', (() => 'unavailable') as HistoryEntryRecorder, 0],
  ])(
    '%s keeps an ACKed import successful and refreshes exactly once',
    async (_capability, recorder, entries) => {
      let imports = 0
      let refreshes = 0
      const source: TextToColumnsControllerPort = {
        async importCellChunks(request) {
          imports += 1
          return acknowledgement(request)
        },
      }
      const { sessionId, store } = createReadyStore()
      store.setter(captureTextToColumnsCapabilityAtom, source)

      await expect(
        store.setter(
          runTextToColumnsFinishAtom,
          createInput(source, sessionId, recorder, async () => {
            refreshes += 1
          }),
        ),
      ).resolves.toBe('completed')

      expect({ imports, refreshes }).toEqual({ imports: 1, refreshes: 1 })
      expect(store.getter(historyStackAtom).entries).toHaveLength(entries)
      expect(store.getter(textToColumnsOpenAtom)).toBe(false)
      expectHistoryLaneAvailable(store)
    },
  )

  test('a rejected direct append remains outcome-unknown and never refreshes or resends', async () => {
    let imports = 0
    let refreshes = 0
    const source: TextToColumnsControllerPort = {
      async importCellChunks(request) {
        imports += 1
        return acknowledgement(request)
      },
    }
    const recorder: HistoryEntryRecorder = (entry, append) =>
      append(entry) ? 'recorded' : 'rejected'
    const { sessionId, store } = createReadyStore()
    store.setter(captureTextToColumnsCapabilityAtom, source)
    const input = createInput(source, sessionId, recorder, async () => {
      refreshes += 1
    })
    const originalWrite = pushHistoryAtom.write
    pushHistoryAtom.write = () => false
    try {
      await expect(store.setter(runTextToColumnsFinishAtom, input)).resolves.toBe('outcome-unknown')
    } finally {
      pushHistoryAtom.write = originalWrite
    }

    expect({ imports, refreshes }).toEqual({ imports: 1, refreshes: 0 })
    expect(store.getter(historyStackAtom).entries).toEqual([])
    expect(store.getter(textToColumnsLifecycleAtom).status).toBe('outcome-unknown')
    expectHistoryLaneAvailable(store)
    await expect(store.setter(runTextToColumnsFinishAtom, input)).resolves.toBe('outcome-unknown')
    expect(imports).toBe(1)
  })
})
