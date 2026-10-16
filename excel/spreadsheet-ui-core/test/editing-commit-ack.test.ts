import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'

import {
  cancelEditingAtom,
  commitCellEditingAtom,
  editingCommitLifecycleAtom,
  editingSessionAtom,
  type EditingCommitRequest,
} from '../src/editing'
import { projectionSnapshotAtom } from '../src/projection'
import { bindEditingMutation, startCellEdit } from './editing-test-support'

describe('editing commit acknowledgement', () => {
  test('closes the editor after Rust acknowledges the exact mutation', async () => {
    const store = createStore()
    startCellEdit(store, 'confirmed')
    bindEditingMutation(store, async (request) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: 'rev-confirmed',
    }))

    await expect(store.setter(commitCellEditingAtom)).resolves.toBe('completed')
    expect(store.getter(editingSessionAtom).status).toBe('idle')
    expect(store.getter(editingCommitLifecycleAtom).status).toBe('ready')
  })

  test.each([
    ['mismatched request id', (request: EditingCommitRequest) => request.requestId + 1, 'rev-3'],
    ['zero revision', (request: EditingCommitRequest) => request.requestId, 0],
    ['negative revision', (request: EditingCommitRequest) => request.requestId, -1],
    ['fractional revision', (request: EditingCommitRequest) => request.requestId, 1.5],
    ['unsafe revision', (request: EditingCommitRequest) => request.requestId, Number.MAX_SAFE_INTEGER + 1],
    ['NaN revision', (request: EditingCommitRequest) => request.requestId, NaN],
    ['infinite revision', (request: EditingCommitRequest) => request.requestId, Infinity],
    ['empty revision', (request: EditingCommitRequest) => request.requestId, ''],
    ['blank revision', (request: EditingCommitRequest) => request.requestId, '  '],
    ['string zero revision', (request: EditingCommitRequest) => request.requestId, ' 0 '],
    ['missing revision', (request: EditingCommitRequest) => request.requestId, undefined],
  ])(
    'keeps a %s acknowledgement outcome unknown without resending',
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

      await expect(store.setter(commitCellEditingAtom)).resolves.toBe('outcome-unknown')
      expect(store.getter(editingCommitLifecycleAtom).status).toBe('outcome-unknown')
      expect(store.getter(editingSessionAtom)).toMatchObject({
        status: 'drafting',
        draft: 'uncertain',
      })
      await expect(store.setter(commitCellEditingAtom)).resolves.toBe('blocked')
      expect(store.setter(cancelEditingAtom)).toBeNull()
      expect(transportCalls).toBe(1)
    },
  )

  test('a matching request id from another worksheet cannot close or resend the edit', async () => {
    const store = createStore()
    startCellEdit(store, 'keep this draft')
    const before = store.getter(projectionSnapshotAtom)
    const write = vi.fn(async (request: EditingCommitRequest) => ({
      sheetId: 'another-sheet', requestId: request.requestId, revision: 1,
    }))
    bindEditingMutation(store, write)
    expect(await store.setter(commitCellEditingAtom)).toBe('outcome-unknown')
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(editingSessionAtom).draft).toBe('keep this draft')
    expect(store.setter(cancelEditingAtom)).toBeNull()
    expect(await store.setter(commitCellEditingAtom)).toBe('blocked')
    expect(write).toHaveBeenCalledOnce()
  })

  test.each([1, Number.MAX_SAFE_INTEGER, 'revision-1'])('a valid committed revision %s closes once and returns to navigation', async (revision) => {
    const store = createStore()
    startCellEdit(store, 'accepted')
    const write = vi.fn(async (request: EditingCommitRequest) => ({
      sheetId: request.sheetId, requestId: request.requestId, revision,
    }))
    bindEditingMutation(store, write)
    expect(await store.setter(commitCellEditingAtom)).toBe('completed')
    expect(store.getter(editingSessionAtom).status).toBe('idle')
    expect(await store.setter(commitCellEditingAtom)).toBe('blocked')
    expect(write).toHaveBeenCalledOnce()
  })
})
