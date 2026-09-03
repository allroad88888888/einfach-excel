import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'

import {
  acquireHistoryProducerReservationAtom,
  historyStackAtom,
  releaseHistoryProducerReservationAtom,
  runEditingCommitAtom,
  type EditingControllerPort,
} from '../src'
import { startCellEdit } from './editing-test-support'

function replayCapableSource(onMutation: () => void = () => undefined): EditingControllerPort {
  return {
    async setCellInput(request) {
      onMutation()
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 'rev-history-projection',
      }
    },
    async undoTransaction() {
      throw new Error('not called while recording the projection')
    },
    async redoTransaction() {
      throw new Error('not called while recording the projection')
    },
  }
}

describe('editing history projection', () => {
  test('projects one acknowledged Rust transaction into the UI timeline', async () => {
    const store = createStore()
    startCellEdit(store, 'tracked')

    await expect(
      store.setter(runEditingCommitAtom, {
        source: replayCapableSource(),
        refreshProjection: async () => undefined,
      }),
    ).resolves.toBe('completed')

    expect(store.getter(historyStackAtom)).toMatchObject({
      cursor: 1,
      entries: [
        {
          kind: 'cell.set-input',
          sheetId: 'sheet-1',
          projectionRevision: 'rev-history-projection',
          affectedRange: { rowStart: 4, rowEnd: 4, colStart: 2, colEnd: 2 },
        },
      ],
    })
  })

  test('does not advertise undo when the backend has no replay ports', async () => {
    const store = createStore()
    startCellEdit(store, 'untracked')

    await expect(
      store.setter(runEditingCommitAtom, {
        source: {
          async setCellInput(request) {
            return {
              sheetId: request.sheetId,
              requestId: request.requestId,
              revision: 'rev-without-replay',
            }
          },
        },
        refreshProjection: async () => undefined,
      }),
    ).resolves.toBe('completed')

    expect(store.getter(historyStackAtom)).toMatchObject({ cursor: 0, entries: [] })
  })

  test('does not launch a replayable mutation while another producer owns the UI lane', async () => {
    const store = createStore()
    let mutationCalls = 0
    startCellEdit(store, 'blocked')
    const reservation = store.setter(acquireHistoryProducerReservationAtom)
    expect(reservation).not.toBeNull()
    if (reservation === null) throw new Error('expected a history reservation')

    await expect(
      store.setter(runEditingCommitAtom, {
        source: replayCapableSource(() => {
          mutationCalls += 1
        }),
        refreshProjection: async () => undefined,
      }),
    ).resolves.toBe('blocked')

    expect(mutationCalls).toBe(0)
    expect(store.setter(releaseHistoryProducerReservationAtom, reservation)).toBe(true)
  })
})
