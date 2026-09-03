import { createStore } from '@einfach/core'
import { describe, expect, jest, test } from '@jest/globals'

import {
  DEFAULT_EDITING_COMMIT_TIMEOUT_MS,
  editingCommitLifecycleAtom,
  runEditingCommitAtom,
  type EditingCommitAcknowledgement,
  type EditingCommitRequest,
} from '../src/editing'
import { deferred, flushMicrotasks, startCellEdit } from './editing-test-support'

describe('editing commit timeout', () => {
  test('uses finite custom/default mutation deadlines and ignores late fulfilment or rejection', async () => {
    jest.useFakeTimers()
    try {
      const fulfilledStore = createStore()
      const fulfilledGate = deferred<EditingCommitAcknowledgement>()
      const fulfilledRequests: EditingCommitRequest[] = []
      startCellEdit(fulfilledStore, 'late fulfilment')
      const fulfilledCommit = fulfilledStore.setter(runEditingCommitAtom, {
        source: {
          setCellInput(request) {
            fulfilledRequests.push(request)
            return fulfilledGate.promise
          },
        },
        refreshProjection: async () => undefined,
        timeoutMs: 25,
      })
      await flushMicrotasks()
      expect(fulfilledRequests).toHaveLength(1)

      await jest.advanceTimersByTimeAsync(24)
      expect(fulfilledStore.getter(editingCommitLifecycleAtom).status).toBe('pending')
      await jest.advanceTimersByTimeAsync(1)
      await expect(fulfilledCommit).resolves.toBe('outcome-unknown')
      fulfilledGate.resolve({
        sheetId: fulfilledRequests[0].sheetId,
        requestId: fulfilledRequests[0].requestId,
        revision: 'late-revision',
      })
      await flushMicrotasks()
      expect(fulfilledStore.getter(editingCommitLifecycleAtom).status).toBe('outcome-unknown')

      const rejectedStore = createStore()
      const rejectedGate = deferred<EditingCommitAcknowledgement>()
      let rejectedTransportCalls = 0
      startCellEdit(rejectedStore, 'late rejection')
      const rejectedCommit = rejectedStore.setter(runEditingCommitAtom, {
        source: {
          setCellInput() {
            rejectedTransportCalls += 1
            return rejectedGate.promise
          },
        },
        refreshProjection: async () => undefined,
        // Invalid values safely select the 15 second default.
        timeoutMs: 0,
      })
      await flushMicrotasks()
      await jest.advanceTimersByTimeAsync(DEFAULT_EDITING_COMMIT_TIMEOUT_MS - 1)
      expect(rejectedStore.getter(editingCommitLifecycleAtom).status).toBe('pending')
      await jest.advanceTimersByTimeAsync(1)
      await expect(rejectedCommit).resolves.toBe('outcome-unknown')
      rejectedGate.reject(new Error('late rejection is still observed'))
      await flushMicrotasks()

      expect(rejectedTransportCalls).toBe(1)
      expect(rejectedStore.getter(editingCommitLifecycleAtom).status).toBe('outcome-unknown')
    } finally {
      jest.useRealTimers()
    }
  })
})
