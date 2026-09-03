import { createStore } from '@einfach/core'
import { describe, expect, jest, test } from '@jest/globals'

import {
  editingCommitLifecycleAtom,
  editingSessionAtom,
  retryEditingRefreshAtom,
  runEditingCommitAtom,
  type EditingCommitOutcome,
  type RetryEditingRefreshInput,
} from '../src/editing'
import { deferred, flushMicrotasks, startCellEdit } from './editing-test-support'

describe('editing refresh retry', () => {
  test('retries only refresh after an exact acknowledgement', async () => {
    const store = createStore()
    let transportCalls = 0
    let refreshCalls = 0
    startCellEdit(store, 'acknowledged')
    const refreshProjection = async () => {
      refreshCalls += 1
      if (refreshCalls === 1) throw new Error('projection unavailable')
    }

    await expect(
      store.setter(runEditingCommitAtom, {
        source: {
          async setCellInput(request) {
            transportCalls += 1
            return {
              sheetId: request.sheetId,
              requestId: request.requestId,
              revision: 42,
            }
          },
        },
        refreshProjection,
      }),
    ).resolves.toBe('refresh-failed')
    expect(store.getter(editingCommitLifecycleAtom)).toMatchObject({
      status: 'refresh-failed',
      acknowledgedRevision: 42,
    })
    expect(store.getter(editingSessionAtom).draft).toBe('acknowledged')

    await expect(
      store.setter(runEditingCommitAtom, {
        source: {},
        refreshProjection,
      }),
    ).resolves.toBe('blocked')
    await expect(store.setter(retryEditingRefreshAtom, { refreshProjection })).resolves.toBe(
      'completed',
    )
    expect(transportCalls).toBe(1)
    expect(refreshCalls).toBe(2)
    expect(store.getter(editingSessionAtom).status).toBe('idle')
  })

  test('retry freezes its getters, times out only refresh, and never resends', async () => {
    jest.useFakeTimers()
    try {
      const store = createStore()
      let transportCalls = 0
      let initialRefreshCalls = 0
      startCellEdit(store, 'refresh retry')
      await expect(
        store.setter(runEditingCommitAtom, {
          source: {
            async setCellInput(request) {
              transportCalls += 1
              return {
                sheetId: request.sheetId,
                requestId: request.requestId,
                revision: 'rev-refresh-retry',
              }
            },
          },
          refreshProjection: async () => {
            initialRefreshCalls += 1
            throw new Error('initial refresh failed')
          },
        }),
      ).resolves.toBe('refresh-failed')

      const retryGate = deferred<void>()
      let retryRefreshReads = 0
      let retryTimeoutReads = 0
      let retryRefreshCalls = 0
      const retryInput = Object.defineProperties(
        {},
        {
          refreshProjection: {
            get() {
              retryRefreshReads += 1
              if (retryRefreshReads > 1) throw new Error('retry refresh getter re-read')
              return () => {
                retryRefreshCalls += 1
                return retryGate.promise
              }
            },
          },
          timeoutMs: {
            get() {
              retryTimeoutReads += 1
              if (retryTimeoutReads > 1) throw new Error('retry timeout getter re-read')
              return 20
            },
          },
        },
      ) as RetryEditingRefreshInput
      const retry = store.setter(retryEditingRefreshAtom, retryInput)
      await flushMicrotasks()
      await jest.advanceTimersByTimeAsync(20)
      await expect(retry).resolves.toBe('refresh-failed')

      expect(retryRefreshReads).toBe(1)
      expect(retryTimeoutReads).toBe(1)
      expect(retryRefreshCalls).toBe(1)
      expect(transportCalls).toBe(1)
      expect(initialRefreshCalls).toBe(1)
      retryGate.reject(new Error('late retry rejection'))
      await flushMicrotasks()
      expect(store.getter(editingCommitLifecycleAtom).status).toBe('refresh-failed')

      const nestedGate = deferred<void>()
      let nestedRetry: Promise<EditingCommitOutcome> | undefined
      let outerRefreshReads = 0
      let outerTimeoutReads = 0
      let nestedRefreshCalls = 0
      const reentrantRetryInput = Object.defineProperties(
        {},
        {
          refreshProjection: {
            get() {
              outerRefreshReads += 1
              nestedRetry = store.setter(retryEditingRefreshAtom, {
                refreshProjection: () => {
                  nestedRefreshCalls += 1
                  return nestedGate.promise
                },
                timeoutMs: 100,
              })
              return async () => {
                throw new Error('superseded retry callback must not run')
              }
            },
          },
          timeoutMs: {
            get() {
              outerTimeoutReads += 1
              return 100
            },
          },
        },
      ) as RetryEditingRefreshInput
      await expect(store.setter(retryEditingRefreshAtom, reentrantRetryInput)).resolves.toBe(
        'blocked',
      )
      expect(nestedRetry).toBeDefined()
      expect(outerRefreshReads).toBe(1)
      expect(outerTimeoutReads).toBe(1)
      expect(nestedRefreshCalls).toBe(1)

      nestedGate.resolve()
      await expect(nestedRetry).resolves.toBe('completed')
      expect(transportCalls).toBe(1)
      expect(store.getter(editingSessionAtom).status).toBe('idle')
    } finally {
      jest.useRealTimers()
    }
  })
})
