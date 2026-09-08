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
  selectCellAtom,
  setViewportRowHeightAtom,
  viewportSizeOverridesAtom,
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
  const change = vi.fn(async (input: RustWorkbookCommands['workbook.changeSheets']['payload']) => {
    const result =
      input.operation === 'delete'
        ? sheets.filter((sheet) => sheet.id !== input.sheetId)
        : [...sheets].reverse()
    return {
      sheets: result.map((sheet, index) => ({ id: sheet.id, name: sheet.name, index })),
      revision: 1,
    }
  })
  const request = vi.fn(
    async (command: string, input: RustWorkbookCommands['workbook.changeSheets']['payload']) => {
      expect(command).toBe('workbook.changeSheets')
      return change(input)
    },
  )
  store.setter(setRustWorkbookConnectionAtom, {
    request,
    dispose: vi.fn(),
  } as unknown as RustWorkbookConnection)
  return {
    store,
    change,
    request,
    run: (input: WorkbookSheetCommand) => store.setter(runWorkbookSheetCommandAtom, input),
  }
}

describe('worksheet structure commands', () => {
  test.each(['move-right', 'move-left'] as const)(
    '%s sends one native mutation and keeps selection on the same sheet',
    async (operation) => {
      const { store, request, run } = setup()
      const id = operation === 'move-right' ? 'orders' : 'summary'
      await run({ operation: 'switch', sheetId: id })
      store.setter(selectCellAtom, { sheetId: id, coord: { row: 3, col: 2 }, extend: false })
      expect(await run({ operation })).toBe(true)
      expect(request).toHaveBeenCalledTimes(1)
      expect(request).toHaveBeenCalledWith(
        'workbook.changeSheets',
        expect.objectContaining({
          operation: 'move',
          sheetId: id,
          targetIndex: operation === 'move-right' ? 1 : 0,
        }),
      )
      expect(store.getter(workbookDocumentAtom).sheets.map((sheet) => sheet.id)).toEqual([
        'summary',
        'orders',
      ])
      expect(store.getter(activeWorkbookSheetAtom)?.id).toBe(id)
      expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({
        sheetId: id,
        row: 3,
        col: 2,
      })
    },
  )

  test('deletion requires confirmation; cancelling sends no mutation', async () => {
    const { store, run, request } = setup()
    expect(await run({ operation: 'delete' })).toBe(false)
    expect(await run({ operation: 'request-delete' })).toBe(true)
    expect(store.getter(sheetTabsAtom).deleteConfirmation).toEqual({
      sheetId: 'orders',
      sheetName: 'Orders',
    })
    await run({ operation: 'cancel-delete' })
    expect(store.getter(sheetTabsAtom).deleteConfirmation).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  test('confirmed deletion activates its neighbor and cleans only deleted size overrides', async () => {
    const { store, run, request } = setup()
    store.setter(setViewportRowHeightAtom, { sheetId: 'orders', rowIndex: 0, heightPx: 80 })
    store.setter(setViewportRowHeightAtom, { sheetId: 'summary', rowIndex: 1, heightPx: 60 })
    await run({ operation: 'request-delete' })
    expect(await run({ operation: 'delete' })).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(store.getter(activeWorkbookSheetAtom)).toMatchObject({
      id: 'summary',
      index: 0,
      rowCount: 100,
    })
    expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet).toEqual({
      summary: { '1': 60 },
    })
    expect(store.getter(sheetTabsAtom).deleteConfirmation).toBeNull()
    expect(await run({ operation: 'delete' })).toBe(false)
    expect(await run({ operation: 'request-delete' })).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)
  })

  test('boundary moves do not dispatch and native failure leaves the tab order intact', async () => {
    const { store, change, run, request } = setup()
    expect(await run({ operation: 'move-left' })).toBe(false)
    expect(request).not.toHaveBeenCalled()
    change.mockRejectedValueOnce(new Error('Native move rejected'))
    expect(await run({ operation: 'move-right' })).toBe(false)
    expect(store.getter(workbookDocumentAtom).sheets.map((sheet) => sheet.id)).toEqual([
      'orders',
      'summary',
    ])
    expect(store.getter(sheetTabsAtom)).toMatchObject({
      error: 'Native move rejected',
      mutation: null,
    })
  })

  test('pending delete cannot be repeated and rejection retains confirmation for retry', async () => {
    const { store, change, request, run } = setup()
    let reject!: (reason: Error) => void
    change.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    await run({ operation: 'request-delete' })
    const deleting = run({ operation: 'delete' })
    expect(await run({ operation: 'delete' })).toBe(false)
    expect(await run({ operation: 'cancel-delete' })).toBe(false)
    reject(new Error('Native delete rejected'))
    expect(await deleting).toBe(false)
    expect(store.getter(sheetTabsAtom)).toMatchObject({
      error: 'Native delete rejected',
      deleteConfirmation: { sheetId: 'orders' },
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(await run({ operation: 'delete' })).toBe(true)
  })
})
