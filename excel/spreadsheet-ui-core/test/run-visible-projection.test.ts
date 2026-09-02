import {
  createSpreadsheetUi,
  projectionSnapshotAtom,
  runVisibleProjectionAtom,
  type SpreadsheetBackend,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../src'
import { describe, expect, test } from '@jest/globals'

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
    const backend = {
      async readVisibleProjection(request: VisibleProjectionRequest) {
        requests.push(request)
        return projectionResult(request)
      },
    } as SpreadsheetBackend
    const core = createSpreadsheetUi({ backend })

    await expect(core.store.setter(runVisibleProjectionAtom, projectionInput(0))).resolves.toEqual({
      status: 'ready',
    })

    expect(requests).toHaveLength(1)
    expect(Object.isFrozen(backend)).toBe(false)
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
    const backend = {
      async readVisibleProjection(request: VisibleProjectionRequest) {
        requests.push(request)
        if (requests.length === 1) await firstGate
        return projectionResult(request)
      },
    } as SpreadsheetBackend
    const core = createSpreadsheetUi({ backend })

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
    const backend = {
      async readVisibleProjection() {
        throw new Error('Rust projection unavailable')
      },
    } as unknown as SpreadsheetBackend
    const core = createSpreadsheetUi({ backend })

    await expect(core.store.setter(runVisibleProjectionAtom, projectionInput(0))).resolves.toEqual({
      status: 'failed',
      error: 'Rust projection unavailable',
    })
    expect(core.store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'error',
      error: { message: 'Rust projection unavailable' },
    })
  })
})
