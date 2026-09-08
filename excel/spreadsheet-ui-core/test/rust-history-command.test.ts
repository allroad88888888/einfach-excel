import { describe, expect, test, vi } from 'vitest'
import { createStore } from '@einfach/core'
import { dispatchKeyboardInputAtom } from '../src/keyboard'
import {
  createSpreadsheetUi,
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
          history: { ...history, undoCount: 0, redoCount: 1 },
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
  test('protection checks the affected sheet, not only the displayed sheet', async () => {
    const { store, apply } = await setup()
    store.setter(setSheetProtectionAtom, {
      sheetId: 'orders',
      state: { mode: 'protected', unlockedRanges: [] },
    })
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(store.getter(rustHistoryPanelAtom).error).toContain('Unprotect')
    expect(apply).not.toHaveBeenCalled()
  })
  test('a cut history cannot rewrite a protected dependent worksheet', async () => {
    const { store, apply } = await setup(false, [0, 1])
    store.setter(setSheetProtectionAtom, {
      sheetId: 'summary',
      state: { mode: 'protected', unlockedRanges: [] },
    })
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(apply).not.toHaveBeenCalled()
    expect(store.getter(rustHistoryPanelAtom).error).toContain('Unprotect')
  })
  test('failure preserves the projection and allows retry', async () => {
    const { store, apply } = await setup(true)
    const before = store.getter(projectionSnapshotAtom)
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(rustHistoryPanelAtom)).toMatchObject({
      busy: false,
      error: 'History failed',
    })
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(apply).toHaveBeenCalledTimes(2)
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
})
