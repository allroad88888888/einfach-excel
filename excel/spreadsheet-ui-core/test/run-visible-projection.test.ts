import {
  createSpreadsheetUi,
  projectionSnapshotAtom,
  runVisibleProjectionAtom,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../src'
import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'
import { deferred } from './editing-test-support'

function projectionResult(request: VisibleProjectionRequest): VisibleProjectionResult {
  return {
    kind: 'visible-window',
    sheetId: request.sheetId,
    requestId: request.requestId,
    window: request.window,
    cells: [],
  }
}

function projectionInput(rowStart: number) {
  return {
    sheetId: 'sheet-1',
    window: { rowStart, rowEnd: rowStart + 9, colStart: 0, colEnd: 4 },
    reason: 'viewport' as const,
  }
}

describe('runVisibleProjectionAtom', () => {
  test.each(['reject', 'wrong-sheet', 'wrong-id'] as const)(
    'an old %s response still drains only the newest queued window', async (failure) => {
      const firstResponse = deferred<VisibleProjectionResult>()
      const read = vi.fn(async (request: VisibleProjectionRequest) => projectionResult(request))
      read.mockReturnValueOnce(firstResponse.promise)
      const { store } = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
        readVisibleProjection: read,
      }) })
      const first = store.setter(runVisibleProjectionAtom, projectionInput(0))
      const middle = store.setter(runVisibleProjectionAtom, projectionInput(10))
      const latest = store.setter(runVisibleProjectionAtom, projectionInput(20))
      expect(read).toHaveBeenCalledOnce()
      const wrong = projectionResult(read.mock.calls[0][0])
      if (failure === 'reject') firstResponse.reject(new Error('old read failed'))
      else firstResponse.resolve({ ...wrong, ...(failure === 'wrong-sheet'
        ? { sheetId: 'other' } : { requestId: wrong.requestId + 100 }) })
      expect(await first).toEqual({ status: 'superseded' })
      expect(await middle).toEqual({ status: 'superseded' })
      expect(await latest).toEqual({ status: 'ready' })
      expect(read.mock.calls.map(([request]) => request.window.rowStart)).toEqual([0, 20])
      expect(store.getter(projectionSnapshotAtom)).toMatchObject({
        status: 'ready', result: { window: projectionInput(20).window },
      })
    },
  )

  test('latest queued failure preserves the previous frame and permits an explicit retry', async () => {
    const read = vi.fn(async (request: VisibleProjectionRequest) => projectionResult(request))
    const { store } = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
      readVisibleProjection: read,
    }) })
    await store.setter(runVisibleProjectionAtom, projectionInput(0))
    const retained = store.getter(projectionSnapshotAtom).result
    const response = deferred<VisibleProjectionResult>()
    read.mockReturnValueOnce(response.promise).mockRejectedValueOnce(new Error('latest unavailable'))
    const first = store.setter(runVisibleProjectionAtom, {
      ...projectionInput(10), retainResult: true,
    })
    const latest = store.setter(runVisibleProjectionAtom, {
      ...projectionInput(20), retainResult: true,
    })
    response.reject(new Error('old unavailable'))
    expect(await first).toEqual({ status: 'superseded' })
    expect(await latest).toEqual({ status: 'failed', error: 'latest unavailable' })
    expect(store.getter(projectionSnapshotAtom).result).toBe(retained)
    expect(await store.setter(runVisibleProjectionAtom, projectionInput(20))).toEqual({ status: 'ready' })
    expect(store.getter(projectionSnapshotAtom).error).toBeUndefined()
    expect(read.mock.calls.map(([request]) => request.window.rowStart)).toEqual([0, 10, 20, 20])
  })

  test('invalid windows never consume the transport or prevent the next valid read', async () => {
    const read = vi.fn(async (request: VisibleProjectionRequest) => projectionResult(request))
    const { store } = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
      readVisibleProjection: read,
    }) })
    for (const rowStart of [-1, NaN, Infinity, 0.5])
      expect(await store.setter(runVisibleProjectionAtom, projectionInput(rowStart)))
        .toMatchObject({ status: 'failed' })
    expect(read).not.toHaveBeenCalled()
    expect(await store.setter(runVisibleProjectionAtom, projectionInput(0))).toEqual({ status: 'ready' })
    expect(read).toHaveBeenCalledOnce()
  })

  test('owns the backend transport and publishes the projection', async () => {
    const requests: VisibleProjectionRequest[] = []
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request: VisibleProjectionRequest) {
        requests.push(request)
        return projectionResult(request)
      },
    })
    const core = createSpreadsheetUi({ connection })

    await expect(core.store.setter(runVisibleProjectionAtom, projectionInput(0))).resolves.toEqual({
      status: 'ready',
    })

    expect(requests).toHaveLength(1)
    expect(core.store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'ready',
      result: { window: projectionInput(0).window },
    })
  })

  test('drains the latest queued window through one core-owned transport', async () => {
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const requests: VisibleProjectionRequest[] = []
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request: VisibleProjectionRequest) {
        requests.push(request)
        if (requests.length === 1) await firstGate
        return projectionResult(request)
      },
    })
    const core = createSpreadsheetUi({ connection })

    const first = core.store.setter(runVisibleProjectionAtom, projectionInput(0))
    const latest = core.store.setter(runVisibleProjectionAtom, projectionInput(20))
    releaseFirst?.()

    await expect(first).resolves.toEqual({ status: 'superseded' })
    await expect(latest).resolves.toEqual({ status: 'ready' })
    expect(requests.map((request) => request.window.rowStart)).toEqual([0, 20])
    expect(core.store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'ready',
      result: { window: projectionInput(20).window },
    })
  })

  test('publishes a terminal backend failure', async () => {
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection() {
        throw new Error('Rust projection unavailable')
      },
    })
    const core = createSpreadsheetUi({ connection })

    await expect(core.store.setter(runVisibleProjectionAtom, projectionInput(0))).resolves.toEqual({
      status: 'failed',
      error: 'Rust projection unavailable',
    })
    expect(core.store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'error',
      error: { message: 'Rust projection unavailable' },
    })
  })

  test('releases an unbound lane so the same store can recover after backend binding', async () => {
    const store = createStore()

    await expect(store.setter(runVisibleProjectionAtom, projectionInput(0))).resolves.toEqual({
      status: 'failed',
      error: 'Rust workbook connection is not bound to this store.',
    })
    expect(store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'error',
      request: { window: projectionInput(0).window },
    })

    const requests: VisibleProjectionRequest[] = []
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request: VisibleProjectionRequest) {
        requests.push(request)
        return projectionResult(request)
      },
    })
    createSpreadsheetUi({ connection, store })

    await expect(store.setter(runVisibleProjectionAtom, projectionInput(20))).resolves.toEqual({
      status: 'ready',
    })
    expect(requests).toHaveLength(1)
    expect(store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'ready',
      request: { window: projectionInput(20).window },
      result: { window: projectionInput(20).window },
    })
  })
})
