import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'

import {
  cancelEditingAtom,
  commitCellEditingAtom,
  DEFAULT_EDITING_COMMIT_TIMEOUT_MS,
  editingCommitLifecycleAtom,
  editingSessionAtom,
  reconcileCellEditingAtom,
  type EditingCommitRequest,
} from '../src/editing'
import type { BackendMutationResult } from '../src/contracts'
import {
  bindEditingMutation,
  deferred,
  flushMicrotasks,
  startCellEdit,
} from './editing-test-support'

describe('editing commit timeout', () => {
  test('blocks duplicate writes while timed-out commit is in flight and reconciles when late response settles', async () => {
    vi.useFakeTimers()
    try {
      const fulfilledStore = createStore()
      const fulfilledGate = deferred<BackendMutationResult>()
      const fulfilledRequests: EditingCommitRequest[] = []
      bindEditingMutation(fulfilledStore, (request) => {
        fulfilledRequests.push(request)
        if (fulfilledRequests.length === 1) return fulfilledGate.promise
        return Promise.resolve({
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'next-revision',
        })
      })
      startCellEdit(fulfilledStore, 'late fulfilment')
      const fulfilledCommit = fulfilledStore.setter(commitCellEditingAtom, {
        timeoutMs: 25,
      })
      await flushMicrotasks()
      expect(fulfilledRequests).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(24)
      expect(fulfilledStore.getter(editingCommitLifecycleAtom).status).toBe('pending')
      await vi.advanceTimersByTimeAsync(1)
      await expect(fulfilledCommit).resolves.toBe('outcome-unknown')

      // While original request is still in flight, duplicate commits, cancel, and reconcile are blocked.
      await expect(fulfilledStore.setter(commitCellEditingAtom)).resolves.toBe('blocked')
      await expect(fulfilledStore.setter(reconcileCellEditingAtom)).resolves.toBe('blocked')
      expect(fulfilledStore.setter(cancelEditingAtom)).toBeNull()
      expect(fulfilledRequests).toHaveLength(1)

      // When the late response settles with a valid acknowledgement, reconcile and release the lock.
      fulfilledGate.resolve({
        sheetId: fulfilledRequests[0].sheetId,
        requestId: fulfilledRequests[0].requestId,
        revision: 'late-revision',
      })
      await flushMicrotasks()
      expect(fulfilledStore.getter(editingCommitLifecycleAtom).status).toBe('ready')
      expect(fulfilledStore.getter(editingSessionAtom).status).toBe('idle')

      // Subsequent edits and commits now succeed instead of being permanently blocked.
      startCellEdit(fulfilledStore, 'after late fulfilment')
      await expect(fulfilledStore.setter(commitCellEditingAtom)).resolves.toBe('completed')
      expect(fulfilledRequests).toHaveLength(2)

      const rejectedStore = createStore()
      const rejectedGate = deferred<BackendMutationResult>()
      let rejectedTransportCalls = 0
      bindEditingMutation(rejectedStore, (request) => {
        rejectedTransportCalls += 1
        if (rejectedTransportCalls === 1) return rejectedGate.promise
        return Promise.resolve({
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'retry-revision',
        })
      })
      startCellEdit(rejectedStore, 'late rejection')
      const rejectedCommit = rejectedStore.setter(commitCellEditingAtom, {
        // Invalid values safely select the 15 second default.
        timeoutMs: 0,
      })
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(DEFAULT_EDITING_COMMIT_TIMEOUT_MS - 1)
      expect(rejectedStore.getter(editingCommitLifecycleAtom).status).toBe('pending')
      await vi.advanceTimersByTimeAsync(1)
      await expect(rejectedCommit).resolves.toBe('outcome-unknown')
      await expect(rejectedStore.setter(commitCellEditingAtom)).resolves.toBe('blocked')

      rejectedGate.reject(new Error('late rejection is still observed'))
      await flushMicrotasks()

      expect(rejectedTransportCalls).toBe(1)
      expect(rejectedStore.getter(editingCommitLifecycleAtom).status).toBe('rejected')
      expect(rejectedStore.getter(editingSessionAtom).draft).toBe('late rejection')

      // After late rejection releases the ticket, retrying the draft succeeds.
      await expect(rejectedStore.setter(commitCellEditingAtom)).resolves.toBe('completed')
      expect(rejectedTransportCalls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
