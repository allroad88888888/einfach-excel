import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'

import {
  editingCommitLifecycleAtom,
  editingSessionAtom,
  runEditingCommitAtom,
  type EditingCommitAcknowledgement,
  type EditingCommitRequest,
} from '../src/editing'
import { bindEditingMutation, deferred, startCellEdit } from './editing-test-support'

describe('editing commit serialization', () => {
  test('freezes one safe request and serializes formula-bar/grid re-entry onto one lane', async () => {
    const store = createStore()
    const acknowledgement = deferred<EditingCommitAcknowledgement>()
    const requests: EditingCommitRequest[] = []
    bindEditingMutation(store, (request) => {
      requests.push(request)
      return acknowledgement.promise
    })
    startCellEdit(store)

    const first = store.setter(runEditingCommitAtom, {
      commitSource: 'formula-bar',
      move: 'down',
      refreshProjection: async () => undefined,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(store.getter(editingCommitLifecycleAtom)).toMatchObject({
      status: 'pending',
      sheetId: 'sheet-1',
      cell: { row: 4, col: 2 },
    })
    expect(store.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      draft: '=B2+2',
    })
    expect(requests).toHaveLength(1)
    expect(Number.isSafeInteger(requests[0].requestId)).toBe(true)
    expect(requests[0].requestId).toBeGreaterThan(0)
    expect(Object.isFrozen(requests[0])).toBe(true)

    await expect(
      store.setter(runEditingCommitAtom, {
        commitSource: 'cell',
        refreshProjection: async () => undefined,
      }),
    ).resolves.toBe('blocked')
    expect(requests).toHaveLength(1)

    acknowledgement.resolve({
      sheetId: requests[0].sheetId,
      requestId: requests[0].requestId,
      revision: 'rev-2',
    })
    await expect(first).resolves.toBe('completed')
    expect(store.getter(editingSessionAtom).status).toBe('idle')
  })
})
