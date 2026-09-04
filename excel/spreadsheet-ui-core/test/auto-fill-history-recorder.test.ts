import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  runAutoFillAtom,
  type AutoFillControllerPort,
  type RunAutoFillIntentInput,
} from '../src/auto-fill'
import type { AutoFillMutationResult, BackendMutationResult } from '../src/backend/types'
import {
  acquireHistoryProducerReservationAtom,
  historyStackAtom,
  pushReservedHistoryAtom,
  releaseHistoryProducerReservationAtom,
  type HistoryEntryRecorder,
} from '../src/history'
import { setSelectionAtom } from '../src/selection'
import { setWorkspaceActiveSheetAtom } from '../src/workspace'

const sheetId = 'sheet-1'
const sourceRange = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
const targetRange = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 }
const affectedRange = { rowStart: 1, rowEnd: 2, colStart: 0, colEnd: 0 }

function createSource(onFill: () => void): AutoFillControllerPort {
  return {
    async readRangeProjection() {
      throw new Error('copy-only fill must not read a series projection')
    },
    async fillRange() {
      onFill()
      return {
        sheetId,
        revision: 8,
        affectedRange,
        applied: true,
        historyTransactionCount: 1,
        historyDisposition: 'undoable',
      } satisfies AutoFillMutationResult
    },
    async setCellInput(): Promise<BackendMutationResult> {
      throw new Error('compact fill must not fall back to cell writes')
    },
  }
}

function createInput(
  source: AutoFillControllerPort,
  historyEntryRecorder: HistoryEntryRecorder,
  refreshProjection: () => Promise<void>,
): RunAutoFillIntentInput {
  return {
    entrypoint: 'fill-handle',
    source,
    historyEntryRecorder,
    refreshProjection: async () => refreshProjection(),
    intent: {
      sheetId,
      sourceRange,
      targetRange,
      direction: 'down',
      copyOnly: true,
    },
  }
}

function createReadyStore() {
  const store = createStore()
  store.setter(setWorkspaceActiveSheetAtom, { sheetId })
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId,
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  })
  return store
}

function expectHistoryLaneAvailable(store: ReturnType<typeof createStore>): void {
  const reservation = store.setter(acquireHistoryProducerReservationAtom)
  expect(reservation).not.toBeNull()
  if (reservation !== null) {
    expect(store.setter(releaseHistoryProducerReservationAtom, reservation)).toBe(true)
  }
}

describe('auto-fill history recorder', () => {
  test.each([
    [
      'full',
      ((entry, append) => (append(entry) ? 'recorded' : 'rejected')) as HistoryEntryRecorder,
      1,
    ],
    ['unavailable', (() => 'unavailable') as HistoryEntryRecorder, 0],
  ])(
    '%s keeps an ACKed fill successful',
    async (_capability, historyEntryRecorder, historyEntries) => {
      const store = createReadyStore()
      let mutations = 0
      let refreshes = 0

      await expect(
        store.setter(
          runAutoFillAtom,
          createInput(
            createSource(() => {
              mutations += 1
            }),
            historyEntryRecorder,
            async () => {
              refreshes += 1
            },
          ),
        ),
      ).resolves.toEqual({
        status: 'completed',
        path: 'fill-range',
        affectedRange,
        historyEntries,
      })

      expect({ mutations, refreshes }).toEqual({ mutations: 1, refreshes: 1 })
      expect(store.getter(historyStackAtom).entries).toHaveLength(historyEntries)
      expectHistoryLaneAvailable(store)
    },
  )

  test('retains the acknowledged mutation reservation when the callback append rejects', async () => {
    const store = createReadyStore()
    let mutations = 0
    let refreshes = 0
    const recorder: HistoryEntryRecorder = (entry, append) =>
      append(entry) ? 'recorded' : 'rejected'
    const originalWrite = pushReservedHistoryAtom.write
    pushReservedHistoryAtom.write = () => false
    try {
      await expect(
        store.setter(
          runAutoFillAtom,
          createInput(
            createSource(() => {
              mutations += 1
            }),
            recorder,
            async () => {
              refreshes += 1
            },
          ),
        ),
      ).resolves.toEqual({
        status: 'outcome-unknown',
        path: 'fill-range',
        reason: 'history-rejected',
      })
    } finally {
      pushReservedHistoryAtom.write = originalWrite
    }

    expect({ mutations, refreshes }).toEqual({ mutations: 1, refreshes: 0 })
    expect(store.getter(historyStackAtom).entries).toHaveLength(0)
    expect(store.setter(acquireHistoryProducerReservationAtom)).toBeNull()
  })
})
