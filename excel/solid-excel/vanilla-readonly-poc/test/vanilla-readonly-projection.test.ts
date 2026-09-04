import { createStore } from '@einfach/core'
import { describe, expect, it } from 'vitest'
import {
  projectionSnapshotAtom,
  type SpreadsheetBackend,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { createStaticSpreadsheetBackend } from '../../src/adapter/static-backend'
import { mountVanillaReadonlyProjection } from '../vanilla-readonly-projection'

const INITIAL_WINDOW = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } as const
const LATER_WINDOW = { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 } as const

interface Deferred<Value> {
  readonly promise: Promise<Value>
  readonly reject: (reason: unknown) => void
  readonly resolve: (value: Value) => void
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitForCallCount(
  requests: readonly VisibleProjectionRequest[],
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 20 && requests.length < expected; attempt += 1) {
    await Promise.resolve()
  }
  expect(requests).toHaveLength(expected)
}

function readCellText(host: HTMLElement): string[] {
  return [...host.querySelectorAll('[role="gridcell"]')].map((cell) => cell.textContent ?? '')
}

describe('vanilla readonly projection POC', () => {
  it('renders a static backend result only after the UI Core snapshot settles', async () => {
    const store = createStore()
    const host = document.createElement('section')
    const backend = createStaticSpreadsheetBackend({
      sheets: [{ id: 'readonly-sheet', name: 'Readonly' }],
      matrix: [['visible', 'outside']],
    })
    const session = mountVanillaReadonlyProjection({
      backend,
      host,
      initialWindow: INITIAL_WINDOW,
      sheetId: 'readonly-sheet',
      store,
    })

    const pending = session.refresh()
    expect(host.dataset.projectionStatus).toBe('loading')
    expect(readCellText(host)).toEqual([])

    await pending

    expect(store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'ready',
      result: { kind: 'visible-window', cells: [{ displayValue: 'visible' }] },
    })
    expect(host.dataset.projectionStatus).toBe('ready')
    expect(readCellText(host)).toEqual(['visible'])

    session.dispose()
    expect(host.childElementCount).toBe(0)
  })

  it('drains only the latest queued window through one visible transport', async () => {
    const store = createStore()
    const host = document.createElement('section')
    const staticBackend = createStaticSpreadsheetBackend({
      sheets: [{ id: 'readonly-sheet', name: 'Readonly' }],
      matrix: [['first', 'latest']],
    })
    const requests: VisibleProjectionRequest[] = []
    const gates: Deferred<VisibleProjectionResult>[] = []
    const backend: Pick<SpreadsheetBackend, 'readVisibleProjection'> = {
      readVisibleProjection(request) {
        const gate = deferred<VisibleProjectionResult>()
        requests.push(request)
        gates.push(gate)
        return gate.promise
      },
    }
    const session = mountVanillaReadonlyProjection({
      backend,
      host,
      initialWindow: INITIAL_WINDOW,
      sheetId: 'readonly-sheet',
      store,
    })

    const active = session.refresh()
    await waitForCallCount(requests, 1)
    await session.refresh(LATER_WINDOW)
    expect(requests).toHaveLength(1)

    gates[0]!.resolve(await staticBackend.readVisibleProjection(requests[0]!))
    await waitForCallCount(requests, 2)
    gates[1]!.resolve(await staticBackend.readVisibleProjection(requests[1]!))
    await active

    expect(requests.map((request) => request.window)).toEqual([INITIAL_WINDOW, LATER_WINDOW])
    expect(store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'ready',
      request: { window: LATER_WINDOW },
    })
    expect(readCellText(host)).toEqual(['latest'])
  })

  it('publishes a terminal read failure through the snapshot before rejecting', async () => {
    const store = createStore()
    const host = document.createElement('section')
    const failure = new Error('static reader unavailable')
    const backend: Pick<SpreadsheetBackend, 'readVisibleProjection'> = {
      async readVisibleProjection() {
        throw failure
      },
    }
    const session = mountVanillaReadonlyProjection({
      backend,
      host,
      initialWindow: INITIAL_WINDOW,
      sheetId: 'readonly-sheet',
      store,
    })

    await expect(session.refresh()).rejects.toBe(failure)

    expect(store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'error',
      error: { code: 'BACKEND_ERROR', message: 'static reader unavailable' },
    })
    expect(host.dataset.projectionStatus).toBe('error')
  })
})
