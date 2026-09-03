import {
  createSpreadsheetUi,
  projectionSnapshotAtom,
  runVisibleProjectionAtom,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../src'
import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

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
