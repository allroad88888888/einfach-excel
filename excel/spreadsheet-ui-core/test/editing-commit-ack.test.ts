import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'

import {
  cancelEditingAtom,
  editingCommitLifecycleAtom,
  editingSessionAtom,
  runEditingCommitAtom,
  startEditingAtom,
  type EditingCommitAcknowledgement,
  type EditingCommitRequest,
} from '../src/editing'
import { bindEditingMutation, startCellEdit } from './editing-test-support'

describe('editing commit acknowledgement', () => {
  test('reads an accessor acknowledgement exactly once and rejects an out-of-target range', async () => {
    const store = createStore()
    startCellEdit(store, 'ack accessors')
    const ackReads: Record<string, number> = {}
    const rangeReads: Record<string, number> = {}
    let blockedReentry = false
    const once = <T>(reads: Record<string, number>, key: string, value: () => T) => ({
      get() {
        reads[key] = (reads[key] ?? 0) + 1
        if (reads[key] > 1) throw new Error(`${key} getter was re-read`)
        return value()
      },
    })
    bindEditingMutation(store, async (request) => {
      const affectedRange = Object.defineProperties({}, {
        rowStart: once(rangeReads, 'rowStart', () => request.row),
        rowEnd: once(rangeReads, 'rowEnd', () => request.row),
        colStart: once(rangeReads, 'colStart', () => request.col),
        colEnd: once(rangeReads, 'colEnd', () => request.col),
      })
      return Object.defineProperties({}, {
        sheetId: once(ackReads, 'sheetId', () => request.sheetId),
        requestId: once(ackReads, 'requestId', () => request.requestId),
        revision: once(ackReads, 'revision', () => {
          blockedReentry =
            store.setter(cancelEditingAtom) === null &&
            store.setter(startEditingAtom, {
              sheetId: 'must-not-replace',
              cell: { row: 0, col: 0 },
              draft: 'must-not-replace',
              source: 'cell',
            }).draft === 'ack accessors'
          return 'rev-accessors'
        }),
        affectedRange: once(ackReads, 'affectedRange', () => affectedRange),
      }) as EditingCommitAcknowledgement
    })

    await expect(store.setter(runEditingCommitAtom, {
      refreshProjection: async () => undefined,
    })).resolves.toBe('completed')
    expect(ackReads).toEqual({ sheetId: 1, requestId: 1, revision: 1, affectedRange: 1 })
    expect(rangeReads).toEqual({ rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 })
    expect(blockedReentry).toBe(true)

    const uncertainStore = createStore()
    startCellEdit(uncertainStore, 'outside range')
    bindEditingMutation(uncertainStore, async (request) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: 'rev-outside',
      affectedRange: {
        rowStart: request.row + 1,
        rowEnd: request.row + 1,
        colStart: request.col,
        colEnd: request.col,
      },
    }))
    await expect(uncertainStore.setter(runEditingCommitAtom, {
      refreshProjection: async () => undefined,
    })).resolves.toBe('outcome-unknown')
  })

  test('a thrown acknowledgement getter fails closed and retains the exact ticket', async () => {
    const store = createStore()
    startCellEdit(store, 'throwing ack')
    let transportCalls = 0
    bindEditingMutation(store, async () => {
      transportCalls += 1
      return Object.defineProperty({}, 'sheetId', {
        get() {
          throw new Error('host ACK getter failed')
        },
      }) as EditingCommitAcknowledgement
    })

    await expect(store.setter(runEditingCommitAtom, {
      refreshProjection: async () => undefined,
    })).resolves.toBe('outcome-unknown')
    expect(store.getter(editingCommitLifecycleAtom).status).toBe('outcome-unknown')
    await expect(store.setter(runEditingCommitAtom, {
      refreshProjection: async () => undefined,
    })).resolves.toBe('blocked')
    expect(transportCalls).toBe(1)
  })

  test.each([
    ['mismatched request id', (request: EditingCommitRequest) => request.requestId + 1, 'rev-3'],
    ['zero revision', (request: EditingCommitRequest) => request.requestId, 0],
  ])(
    'treats a %s acknowledgement as outcome-unknown without resend',
    async (_label, acknowledgementRequestId, revision) => {
      const store = createStore()
      let transportCalls = 0
      startCellEdit(store, 'uncertain')
      bindEditingMutation(store, async (request) => {
        transportCalls += 1
        return {
          sheetId: request.sheetId,
          requestId: acknowledgementRequestId(request),
          revision,
        }
      })

      await expect(store.setter(runEditingCommitAtom, {
        refreshProjection: async () => undefined,
      })).resolves.toBe('outcome-unknown')
      expect(store.getter(editingCommitLifecycleAtom).status).toBe('outcome-unknown')
      expect(store.getter(editingSessionAtom)).toMatchObject({
        status: 'drafting',
        draft: 'uncertain',
      })
      await expect(store.setter(runEditingCommitAtom, {
        refreshProjection: async () => undefined,
      })).resolves.toBe('blocked')
      expect(store.setter(cancelEditingAtom)).toBeNull()
      expect(transportCalls).toBe(1)
    },
  )
})
