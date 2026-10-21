import { describe, expect, test, vi } from 'vitest'
import { createStore } from '@einfach/core'
import { dispatchKeyboardInputAtom } from '../src/keyboard'
import {
  createSpreadsheetUi,
  dispatchGridCellKeyboardInputAtom,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  runRustHistoryAtom,
  rustHistoryStateAtom,
  rustHistoryPanelAtom,
  projectionSnapshotAtom,
  setSheetProtectionAtom,
  setRustWorkbookConnectionAtom,
  viewportSizeOverridesAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'
import { deferred } from './editing-test-support'

const range = { rowStart: 50, rowEnd: 50, colStart: 1, colEnd: 1 }
async function setup(failure = false, affectedSheets = [0]) {
  const entry = { label: 'Edit cell', sheetIndex: 0, affectedSheets, range }
  const history = { undoCount: 1, redoCount: 0, entries: [entry], notice: null }
  const apply = vi.fn(
    async (
      input: RustWorkbookCommands['history.apply']['payload'],
    ): Promise<RustWorkbookCommands['history.apply']['result']> => {
      if (failure) throw new Error('History failed')
      return {
        projection: {
          ...input.projection,
          cells: [],
          revision: 1,
          history: { ...history, undoCount: input.direction === 'undo' ? 0 : 1,
            redoCount: input.direction === 'undo' ? 1 : 0 },
        },
        sheetId: 'orders',
        range,
        sizes: { rowHeights: [{ rowIndex: 50, heightPx: 44 }], colWidths: [] },
      }
    },
  )
  const request = vi.fn(async (command: string, input: unknown) =>
    command === 'history.apply'
      ? apply(input as RustWorkbookCommands['history.apply']['payload'])
      : {
          ...(input as { request: VisibleProjectionRequest }).request,
          cells: [],
          revision: 0,
          history,
        },
  )
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  const { store } = createSpreadsheetUi({ connection })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: ['orders', 'summary'].map((id, index) => ({
      id,
      index,
      name: id,
      rowCount: 100,
      colCount: 8,
    })),
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'summary',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
  })
  return { store, apply, request }
}

describe('Rust history command', () => {
  test.each([
    [{ key: 'z', ctrlKey: true }, 'undo'], [{ key: 'z', metaKey: true }, 'undo'],
    [{ key: 'y', ctrlKey: true }, 'redo'], [{ key: 'z', metaKey: true, shiftKey: true }, 'redo'],
  ] as const)(
    'grid %j can %s while stale-cell editing is blocked', async (keyboard, action) => {
      const { store, apply } = await setup()
      if (action === 'redo') await store.setter(runRustHistoryAtom, 'undo')
      apply.mockClear()
      store.setter(dispatchGridCellKeyboardInputAtom, {
        sheetId: 'summary', cell: { row: 0, col: 0 }, keyboard, allowEditing: false,
      })
      await vi.waitFor(() => expect(store.getter(rustHistoryStateAtom).undoCount)
        .toBe(action === 'undo' ? 0 : 1))
      expect(apply).toHaveBeenCalledTimes(1)
      expect(apply.mock.calls[0][0].direction).toBe(action)
    },
  )
  test.each([
    [{ key: 'z', metaKey: true }, 'history.undo'],
    [{ key: 'Z', metaKey: true, shiftKey: true }, 'history.redo'],
    [{ key: 'z', ctrlKey: true, shiftKey: true }, 'history.redo'],
    [{ key: 'y', ctrlKey: true }, 'history.redo'],
  ] as const)('maps %j to %s', (input, expected) => {
    expect(createStore().setter(dispatchKeyboardInputAtom, input).type).toBe(expected)
  })
  test('one RPC undoes the source sheet while retaining the displayed sheet', async () => {
    const { store, apply, request } = await setup()
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(true)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      direction: 'undo',
      projection: { sheetId: 'summary' },
    })
    expect(request).toHaveBeenCalledTimes(2)
    expect(store.getter(rustHistoryStateAtom)).toMatchObject({ undoCount: 0, redoCount: 1 })
    expect(store.getter(projectionSnapshotAtom).result?.sheetId).toBe('summary')
    expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.orders?.['50']).toBe(44)
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(await store.setter(runRustHistoryAtom, 'redo')).toBe(true)
    expect(apply.mock.lastCall?.[0].direction).toBe('redo')
  })
  test('opening and closing the list never calls Rust', async () => {
    const { store, apply } = await setup()
    await store.setter(runRustHistoryAtom, 'open')
    expect(store.getter(rustHistoryPanelAtom).open).toBe(true)
    await store.setter(runRustHistoryAtom, 'close')
    expect(store.getter(rustHistoryPanelAtom).open).toBe(false)
    expect(apply).not.toHaveBeenCalled()
  })
  test('native protection checks the affected sheet and rejection preserves its history', async () => {
    const { store, apply } = await setup()
    store.setter(setSheetProtectionAtom, {
      sheetId: 'orders',
      state: { mode: 'protected', unlockedRanges: [] },
    })
    apply.mockRejectedValueOnce(new Error('This worksheet is protected.'))
    const before = store.getter(projectionSnapshotAtom)
    const sizes = store.getter(viewportSizeOverridesAtom)
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(store.getter(rustHistoryPanelAtom).error).toContain('protected')
    expect(apply).toHaveBeenCalledTimes(1)
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(viewportSizeOverridesAtom)).toBe(sizes)
    expect(store.getter(rustHistoryStateAtom)).toMatchObject({ undoCount: 1, redoCount: 0 })
  })
  test('a cut history cannot rewrite a protected dependent worksheet', async () => {
    const { store, apply } = await setup(false, [0, 1])
    store.setter(setSheetProtectionAtom, {
      sheetId: 'summary',
      state: { mode: 'protected', unlockedRanges: [] },
    })
    apply.mockRejectedValueOnce(new Error('This worksheet is protected.'))
    const before = store.getter(projectionSnapshotAtom)
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(rustHistoryPanelAtom).error).toContain('protected')
  })
  test('protected editable-range history accepts native undo and redo acknowledgements', async () => {
    const { store, apply } = await setup()
    store.setter(setSheetProtectionAtom, {
      sheetId: 'orders', state: { mode: 'protected', unlockedRanges: [range] },
    })
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(true)
    expect(store.getter(rustHistoryStateAtom)).toMatchObject({ undoCount: 0, redoCount: 1 })
    expect(await store.setter(runRustHistoryAtom, 'redo')).toBe(true)
    expect(store.getter(rustHistoryStateAtom)).toMatchObject({ undoCount: 1, redoCount: 0 })
    expect(apply).toHaveBeenCalledTimes(2)
  })
  test('failure preserves the projection and allows retry', async () => {
    const { store, apply } = await setup()
    apply.mockRejectedValueOnce(new Error('History failed'))
    const before = store.getter(projectionSnapshotAtom)
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(rustHistoryPanelAtom)).toMatchObject({
      busy: false,
      error: 'History failed',
    })
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(true)
    expect(apply).toHaveBeenCalledTimes(2)
    expect(store.getter(rustHistoryStateAtom)).toMatchObject({ undoCount: 0, redoCount: 1 })
    expect(store.getter(rustHistoryPanelAtom)).toMatchObject({ busy: false, error: null })
    expect(await store.setter(runRustHistoryAtom, 'redo')).toBe(true)
    expect(store.getter(rustHistoryStateAtom)).toMatchObject({ undoCount: 1, redoCount: 0 })
  })
  test('pending blocks repeated commands and disposal prevents stale publication', async () => {
    const { store, apply } = await setup()
    let finish!: (result: RustWorkbookCommands['history.apply']['result']) => void
    apply.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = store.setter(runRustHistoryAtom, 'undo')
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(await store.setter(runRustHistoryAtom, 'close')).toBe(false)
    const input = apply.mock.lastCall![0]
    store.setter(setRustWorkbookConnectionAtom, null)
    finish({
      projection: { ...input.projection, cells: [], revision: 1 },
      sheetId: 'orders',
      range,
      sizes: { rowHeights: [{ rowIndex: 50, heightPx: 44 }], colWidths: [] },
    })
    expect(await pending).toBe(false)
    expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.orders).toBeUndefined()
    expect(store.getter(rustHistoryPanelAtom).busy).toBe(false)
  })
  test('mismatched projection cannot publish history or geometry', async () => {
    const { store, apply } = await setup()
    const before = store.getter(projectionSnapshotAtom)
    apply.mockImplementationOnce(async (input) => ({
      projection: { ...input.projection, sheetId: 'orders', cells: [], revision: 1 },
      sheetId: 'orders',
      range,
      sizes: { rowHeights: [], colWidths: [] },
    }))
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(rustHistoryPanelAtom).error).toContain('mismatched')
  })

  test.each(['source-sheet', 'request-id', 'unexpected-sheets', 'visibility'] as const)(
    '%s corruption preserves history and geometry, then permits a valid undo', async (field) => {
      const { store, apply } = await setup()
      const before = store.getter(projectionSnapshotAtom)
      const sizes = store.getter(viewportSizeOverridesAtom)
      const original = apply.getMockImplementation()!
      apply.mockImplementationOnce(async (input) => {
        const result = await original(input)
        if (field === 'source-sheet') return { ...result, sheetId: 'summary' }
        if (field === 'request-id') return { ...result, projection: {
          ...result.projection, requestId: input.projection.requestId + 1,
        } }
        if (field === 'unexpected-sheets') return { ...result, sheets: [
          { id: 'alien', index: 0, name: 'Alien', key: 'alien', rowCount: 100, colCount: 8 },
        ] }
        return { ...result, visibility: { manualRows: [-1], manualColumns: [], filterRows: [] } }
      })
      expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
      expect(store.getter(projectionSnapshotAtom)).toBe(before)
      expect(store.getter(viewportSizeOverridesAtom)).toBe(sizes)
      expect(store.getter(rustHistoryStateAtom)).toMatchObject({ undoCount: 1, redoCount: 0 })
      expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(true)
      expect(store.getter(rustHistoryStateAtom)).toMatchObject({ undoCount: 0, redoCount: 1 })
    },
  )

  test('missing affected sheet blocks history before native write', async () => {
    const { store, apply } = await setup(false, [0, 99])
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(apply).not.toHaveBeenCalled()
    expect(store.getter(rustHistoryPanelAtom).error).toBe('The worksheet no longer exists.')
  })

  test.each(['success', 'failure'] as const)('late %s after connection replacement cannot change the new projection', async (outcome) => {
    const { store, apply } = await setup()
    const response = deferred<RustWorkbookCommands['history.apply']['result']>()
    const original = apply.getMockImplementation()!
    apply.mockReturnValueOnce(response.promise)
    const pending = store.setter(runRustHistoryAtom, 'undo')
    await Promise.resolve()
    const input = apply.mock.calls[0][0]
    const replacement = { request: vi.fn(async (_command, payload: {
      request: VisibleProjectionRequest,
    }) => ({ ...payload.request, revision: 77, cells: [],
      history: { undoCount: 0, redoCount: 0, entries: [], notice: null } })), dispose() {} }
    store.setter(setRustWorkbookConnectionAtom, replacement as RustWorkbookConnection)
    await store.setter(runVisibleProjectionAtom, { sheetId: 'summary', reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 } })
    const current = store.getter(projectionSnapshotAtom)
    if (outcome === 'success') response.resolve(await original(input))
    else response.reject(new Error('old worker failed'))
    expect(await pending).toBe(false)
    expect(store.getter(projectionSnapshotAtom)).toBe(current)
    expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.orders).toBeUndefined()
    expect(store.getter(rustHistoryPanelAtom)).toMatchObject({ busy: false, error: null })
  })
})
