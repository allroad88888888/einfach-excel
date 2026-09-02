import { describe, expect, jest, test } from '@jest/globals'
import {
  commitCellEditingAtom,
  createSpreadsheetUi,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  editingSessionAtom,
  projectionSnapshotAtom,
  retryCellEditingRefreshAtom,
  runVisibleProjectionAtom,
  startCellEditingFromProjectionAtom,
  type BackendMutationResult,
  type EditingCommitRequest,
  type SpreadsheetBackend,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../src'

function projectionResult(
  request: VisibleProjectionRequest,
  value = 'Projected value',
): VisibleProjectionResult {
  return {
    kind: 'visible-window',
    sheetId: request.sheetId,
    requestId: request.requestId,
    window: request.window,
    cells: [
      {
        row: request.window.rowStart + 1,
        col: request.window.colStart + 2,
        displayValue: value,
        formula: '=A1+1',
      },
    ],
  }
}

const visibleInput = {
  sheetId: 'sheet-1',
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
  reason: 'viewport' as const,
}

const laterVisibleInput = {
  ...visibleInput,
  window: { ...visibleInput.window, rowStart: 20, rowEnd: 29 },
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

describe('bound cell editing commands', () => {
  test('starts the cell draft from the current visible projection', async () => {
    const backend = {
      async readVisibleProjection(request: VisibleProjectionRequest) {
        return projectionResult(request)
      },
    } as SpreadsheetBackend
    const core = createSpreadsheetUi({ backend })
    await core.store.setter(runVisibleProjectionAtom, visibleInput)

    expect(
      core.store.setter(startCellEditingFromProjectionAtom, {
        sheetId: 'sheet-1',
        cell: { row: 1, col: 2 },
      }),
    ).toBe(true)
    expect(core.store.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      source: { sheetId: 'sheet-1', cell: { row: 1, col: 2 }, source: 'cell' },
      draft: '=A1+1',
    })
    expect(
      core.store.setter(startCellEditingFromProjectionAtom, {
        sheetId: 'sheet-1',
        cell: { row: 20, col: 2 },
      }),
    ).toBe(false)
  })

  test('keeps a rejected backend mutation as an editable draft', async () => {
    const setCellInput = jest.fn(async () => {
      throw new Error('Rust write rejected')
    })
    const backend = {
      async readVisibleProjection(request: VisibleProjectionRequest) {
        return projectionResult(request)
      },
      setCellInput,
    } as unknown as SpreadsheetBackend
    const core = createSpreadsheetUi({ backend })
    await core.store.setter(runVisibleProjectionAtom, visibleInput)
    core.store.setter(startCellEditingFromProjectionAtom, {
      sheetId: 'sheet-1',
      cell: { row: 1, col: 2 },
    })
    core.store.setter(editingDraftAtom, { draft: 'Retry me', source: 'cell' })

    await expect(core.store.setter(commitCellEditingAtom)).resolves.toBe('rejected')
    expect(setCellInput).toHaveBeenCalledTimes(1)
    expect(core.store.getter(editingCommitLifecycleAtom)).toMatchObject({
      status: 'rejected',
      error: expect.stringContaining('Rust write rejected'),
    })
    expect(core.store.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      draft: 'Retry me',
    })
  })

  test('retries only refresh after one acknowledged mutation', async () => {
    let projectionCalls = 0
    const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
      projectionCalls += 1
      if (projectionCalls === 2) throw new Error('Rust refresh failed')
      return projectionResult(request, projectionCalls === 3 ? 'Saved once' : 'Before')
    })
    const setCellInput = jest.fn(async (request: EditingCommitRequest) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: 1,
    }))
    const core = createSpreadsheetUi({
      backend: { readVisibleProjection, setCellInput } as unknown as SpreadsheetBackend,
    })
    await core.store.setter(runVisibleProjectionAtom, visibleInput)
    core.store.setter(startCellEditingFromProjectionAtom, {
      sheetId: 'sheet-1',
      cell: { row: 1, col: 2 },
    })
    core.store.setter(editingDraftAtom, { draft: 'Saved once', source: 'cell' })

    await expect(core.store.setter(commitCellEditingAtom)).resolves.toBe('refresh-failed')
    expect(setCellInput).toHaveBeenCalledTimes(1)
    expect(core.store.getter(editingCommitLifecycleAtom).status).toBe('refresh-failed')

    await expect(core.store.setter(runVisibleProjectionAtom, laterVisibleInput)).resolves.toEqual({
      status: 'ready',
    })

    await expect(core.store.setter(retryCellEditingRefreshAtom)).resolves.toBe('completed')
    expect(setCellInput).toHaveBeenCalledTimes(1)
    expect(readVisibleProjection).toHaveBeenCalledTimes(4)
    expect(readVisibleProjection.mock.calls.map(([request]) => request.window.rowStart)).toEqual([
      0,
      0,
      20,
      20,
    ])
    expect(core.store.getter(editingCommitLifecycleAtom).status).toBe('ready')
  })

  test('refreshes the visible window current when a deferred mutation is acknowledged', async () => {
    const requests: VisibleProjectionRequest[] = []
    const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
      requests.push(request)
      return projectionResult(request)
    })
    const mutation = deferred<BackendMutationResult>()
    let mutationRequest: EditingCommitRequest | undefined
    const setCellInput = jest.fn((request: EditingCommitRequest) => {
      mutationRequest = request
      return mutation.promise
    })
    const core = createSpreadsheetUi({
      backend: { readVisibleProjection, setCellInput } as unknown as SpreadsheetBackend,
    })
    await core.store.setter(runVisibleProjectionAtom, visibleInput)
    core.store.setter(startCellEditingFromProjectionAtom, {
      sheetId: 'sheet-1',
      cell: { row: 1, col: 2 },
    })
    core.store.setter(editingDraftAtom, { draft: 'Slow save', source: 'cell' })

    const commit = core.store.setter(commitCellEditingAtom)
    await flushMicrotasks()
    expect(setCellInput).toHaveBeenCalledTimes(1)
    await expect(core.store.setter(runVisibleProjectionAtom, laterVisibleInput)).resolves.toEqual({
      status: 'ready',
    })

    if (mutationRequest === undefined) throw new Error('Expected the mutation to start.')
    mutation.resolve({
      sheetId: mutationRequest.sheetId,
      requestId: mutationRequest.requestId,
      revision: 1,
    })
    await expect(commit).resolves.toBe('completed')

    expect(setCellInput).toHaveBeenCalledTimes(1)
    expect(requests.map((request) => request.window.rowStart)).toEqual([0, 20, 20])
    expect(core.store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'ready',
      request: { window: laterVisibleInput.window },
      result: { window: laterVisibleInput.window },
    })
  })
})
