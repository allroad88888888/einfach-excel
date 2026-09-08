import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'
import {
  initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom,
  runWorkbookSheetCommandAtom,
  activeWorkbookSheetAtom,
  workbookDocumentAtom,
  sheetTabsAtom,
  selectionSnapshotAtom,
  selectionBoundsAtom,
  viewportMetricsAtom,
  setViewportScrollAtom,
  selectCellAtom,
  type RustWorkbookConnection,
  type RustWorkbookCommands,
  type WorkbookSheetCommand,
} from '../src'

function setup() {
  const store = createStore()
  const sheets = [
    { id: 'orders', name: 'Orders', index: 0, rowCount: 1001, colCount: 16 },
    { id: 'summary', name: 'Summary', index: 1, rowCount: 100, colCount: 8 },
  ]
  store.setter(initializeWorkbookDocumentAtom, { title: 'Test', sheets })
  const edit = vi.fn(async (input: RustWorkbookCommands['workbook.editSheet']['payload']) => ({
    sheet: { id: input.sheetId ?? 'new', index: input.sheetId ? 0 : 2, name: input.name },
    revision: 1,
  }))
  const request = vi.fn(
    async (command: string, input: RustWorkbookCommands['workbook.editSheet']['payload']) => {
      expect(command).toBe('workbook.editSheet')
      return edit(input)
    },
  )
  const connection = { request, dispose: vi.fn() } as unknown as RustWorkbookConnection
  store.setter(setRustWorkbookConnectionAtom, connection)
  return {
    store,
    edit,
    request,
    run: (input: WorkbookSheetCommand) => store.setter(runWorkbookSheetCommandAtom, input),
  }
}

describe('Rust workbook sheet commands', () => {
  test('adds one Rust sheet and publishes returned identity without reinitializing', async () => {
    const { store, run, request } = setup()
    expect(await run({ operation: 'add' })).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('workbook.editSheet', {
      name: 'Sheet3',
      sheetId: undefined,
      projection: undefined,
    })
    expect(store.getter(workbookDocumentAtom).sheets).toHaveLength(3)
    expect(store.getter(activeWorkbookSheetAtom)).toMatchObject({
      id: 'new',
      name: 'Sheet3',
      rowCount: 1001,
    })
    expect(store.getter(sheetTabsAtom).mutation).toBeNull()
  })

  test('switch resets selection and scroll, updates bounds, and sends no Rust mutation', async () => {
    const { store, run, request } = setup()
    store.setter(selectCellAtom, { sheetId: 'orders', coord: { row: 999, col: 15 }, extend: false })
    store.setter(setViewportScrollAtom, { scrollTop: 500, scrollLeft: 500 })
    expect(await run({ operation: 'switch', sheetId: 'summary' })).toBe(true)
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
    expect(store.getter(selectionBoundsAtom)).toEqual({ rowCount: 100, colCount: 8 })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({
      sheetId: 'summary',
      row: 0,
      col: 0,
    })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollLeft: 0, scrollTop: 0 })
    expect(request).not.toHaveBeenCalled()
    expect(await run({ operation: 'switch', sheetId: 'missing' })).toBe(false)
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
  })

  test('rename keeps stable identity, dimensions, active sheet and selection', async () => {
    const { store, run, request } = setup()
    store.setter(selectCellAtom, { sheetId: 'orders', coord: { row: 5, col: 3 }, extend: false })
    await run({ operation: 'begin-rename', sheetId: 'orders' })
    await run({ operation: 'change-name', name: 'Budget' })
    expect(await run({ operation: 'rename' })).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(store.getter(activeWorkbookSheetAtom)).toMatchObject({
      id: 'orders',
      name: 'Budget',
      rowCount: 1001,
    })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 5, col: 3 })
    expect(store.getter(sheetTabsAtom).rename).toBeNull()
  })

  test('native rejection keeps original metadata and draft for retry or cancellation', async () => {
    const { store, edit, run } = setup()
    edit.mockRejectedValueOnce(new Error('Duplicate sheet name'))
    await run({ operation: 'begin-rename', sheetId: 'orders' })
    await run({ operation: 'change-name', name: 'Summary' })
    expect(await run({ operation: 'rename' })).toBe(false)
    expect(store.getter(activeWorkbookSheetAtom)?.name).toBe('Orders')
    expect(store.getter(sheetTabsAtom)).toMatchObject({
      error: 'Duplicate sheet name',
      mutation: null,
      rename: { draftName: 'Summary' },
    })
    await run({ operation: 'cancel-rename' })
    expect(store.getter(sheetTabsAtom)).toMatchObject({ error: null, rename: null })
  })

  test('pending mutation blocks duplicate clicks, response from disposed workbook is ignored', async () => {
    const { store, edit, run, request } = setup()
    let resolve!: (value: Awaited<ReturnType<typeof edit>>) => void
    edit.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const adding = run({ operation: 'add' })
    expect(await run({ operation: 'add' })).toBe(false)
    expect(await run({ operation: 'switch', sheetId: 'summary' })).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)
    store.setter(setRustWorkbookConnectionAtom, null)
    resolve({ sheet: { id: 'late', index: 2, name: 'Late' }, revision: 1 })
    expect(await adding).toBe(false)
    expect(store.getter(workbookDocumentAtom).sheets).toHaveLength(2)
  })
})
