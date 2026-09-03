import { describe, expect, jest, test } from '@jest/globals'
import {
  commitCellEditingAtom,
  createSpreadsheetUi,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  editingSessionAtom,
  projectionSnapshotAtom,
  runVisibleProjectionAtom,
  startCellEditingFromProjectionAtom,
  type BackendMutationResult,
  type EditingCommitRequest,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

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
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request: VisibleProjectionRequest) {
        return projectionResult(request)
      },
    })
    const core = createSpreadsheetUi({ connection })
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

  test('starts a keyboard draft from the typed character', async () => {
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request: VisibleProjectionRequest) {
        return projectionResult(request)
      },
    })
    const core = createSpreadsheetUi({ connection })
    await core.store.setter(runVisibleProjectionAtom, visibleInput)

    expect(
      core.store.setter(startCellEditingFromProjectionAtom, {
        sheetId: 'sheet-1',
        cell: { row: 1, col: 2 },
        source: 'keyboard',
        initialDraft: 'x',
      }),
    ).toBe(true)
    expect(core.store.getter(editingSessionAtom)).toMatchObject({
      source: { source: 'keyboard' },
      draft: 'x',
    })
  })

  test('keeps a rejected backend mutation as an editable draft', async () => {
    const setCellInput = jest.fn(async () => {
      throw new Error('Rust write rejected')
    })
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request: VisibleProjectionRequest) {
        return projectionResult(request)
      },
      setCellInput,
    })
    const core = createSpreadsheetUi({ connection })
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

  test('publishes the projection bundled with one mutation command', async () => {
    const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) =>
      projectionResult(request, 'Before'),
    )
    const setCellProjection = jest.fn(async (request: VisibleProjectionRequest) =>
      projectionResult(request, 'Saved once'),
    )
    const setCellInput = jest.fn(async (request: EditingCommitRequest) => ({
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: 1,
    }))
    const core = createSpreadsheetUi({
      connection: createTestRustWorkbookConnection({
        readVisibleProjection,
        setCellInput,
        setCellProjection,
      }),
    })
    await core.store.setter(runVisibleProjectionAtom, visibleInput)
    core.store.setter(startCellEditingFromProjectionAtom, {
      sheetId: 'sheet-1',
      cell: { row: 1, col: 2 },
    })
    core.store.setter(editingDraftAtom, { draft: 'Saved once', source: 'cell' })

    await expect(core.store.setter(commitCellEditingAtom)).resolves.toBe('completed')
    expect(setCellInput).toHaveBeenCalledTimes(1)
    expect(readVisibleProjection).toHaveBeenCalledTimes(1)
    expect(setCellProjection).toHaveBeenCalledTimes(1)
    expect(core.store.getter(projectionSnapshotAtom).result?.cells[0]?.displayValue).toBe(
      'Saved once',
    )
    expect(core.store.getter(editingCommitLifecycleAtom).status).toBe('ready')
  })

  test('refreshes the visible window current when a deferred mutation is acknowledged', async () => {
    const requests: VisibleProjectionRequest[] = []
    const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
      requests.push(request)
      return projectionResult(request)
    })
    const bundledRequests: VisibleProjectionRequest[] = []
    const setCellProjection = jest.fn(async (request: VisibleProjectionRequest) => {
      bundledRequests.push(request)
      return projectionResult(request, 'Slow save')
    })
    const mutation = deferred<BackendMutationResult>()
    let mutationRequest: EditingCommitRequest | undefined
    const setCellInput = jest.fn((request: EditingCommitRequest) => {
      mutationRequest = request
      return mutation.promise
    })
    const core = createSpreadsheetUi({
      connection: createTestRustWorkbookConnection({
        readVisibleProjection,
        setCellInput,
        setCellProjection,
      }),
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
    expect(requests.map((request) => request.window.rowStart)).toEqual([0, 20])
    expect(bundledRequests.map((request) => request.window.rowStart)).toEqual([0])
    expect(core.store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'ready',
      request: { window: laterVisibleInput.window },
      result: { window: laterVisibleInput.window },
    })
  })
})
