import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'

import {
  cancelEditingAtom,
  commitCellEditingAtom,
  editingCommitLifecycleAtom,
  editingSessionAtom,
  type EditingCommitRequest,
} from '../src/editing'
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
})
