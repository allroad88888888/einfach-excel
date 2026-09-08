import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  selectCellAtom,
  runVisibleProjectionAtom,
  runPasteSpecialPanelAtom,
  pasteSpecialPanelAtom,
  type RustClipboardPasteRequest,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  const read = vi.fn(async (request: VisibleProjectionRequest) => ({
    ...request,
    revision: 0,
    cells: [],
  }))
  const paste = vi.fn(
    async (request: RustClipboardPasteRequest, projection: VisibleProjectionRequest) => ({
      acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
      projection: { ...projection, revision: 1, cells: [] },
    }),
  )
  const { store } = createSpreadsheetUi({
    connection: createTestRustWorkbookConnection({
      readVisibleProjection: read,
      pasteClipboard: paste,
    }),
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', name: 'Test', index: 0, rowCount: 10, colCount: 10 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 },
  })
  return { store, read, paste }
}

test('composed options send exactly one existing paste request and reset after success', async () => {
  const { store, paste, read } = await setup()
  await store.setter(runPasteSpecialPanelAtom, 'open')
  await store.setter(runPasteSpecialPanelAtom, { field: 'mode', value: 'values' })
  await store.setter(runPasteSpecialPanelAtom, { field: 'arithmetic', value: 'divide' })
  await store.setter(runPasteSpecialPanelAtom, { field: 'transpose', value: true })
  await store.setter(runPasteSpecialPanelAtom, { field: 'skipBlanks', value: true })
  expect(
    await store.setter(runPasteSpecialPanelAtom, {
      action: 'apply',
      read: async () => ({ text: '2' }),
    }),
  ).toBe(true)
  expect(paste).toHaveBeenCalledTimes(1)
  expect(paste.mock.calls[0][0]).toMatchObject({
    mode: 'values',
    arithmetic: 'divide',
    transpose: true,
    skipBlanks: true,
  })
  expect(read).toHaveBeenCalledTimes(1)
  expect(store.getter(pasteSpecialPanelAtom).target).toBeNull()
  await store.setter(runPasteSpecialPanelAtom, 'open')
  expect(store.getter(pasteSpecialPanelAtom)).toMatchObject({
    mode: 'all',
    arithmetic: 'none',
    transpose: false,
    skipBlanks: false,
    error: null,
  })
})

test('format-only and column-width choices clear incompatible options before submission', async () => {
  const { store } = await setup()
  await store.setter(runPasteSpecialPanelAtom, 'open')
  await store.setter(runPasteSpecialPanelAtom, { field: 'arithmetic', value: 'divide' })
  await store.setter(runPasteSpecialPanelAtom, { field: 'transpose', value: true })
  await store.setter(runPasteSpecialPanelAtom, { field: 'mode', value: 'formats' })
  expect(store.getter(pasteSpecialPanelAtom)).toMatchObject({ arithmetic: 'none', transpose: true })
  await store.setter(runPasteSpecialPanelAtom, { field: 'mode', value: 'column-widths' })
  expect(store.getter(pasteSpecialPanelAtom)).toMatchObject({
    arithmetic: 'none',
    transpose: false,
    skipBlanks: false,
  })
})

test('failure keeps options and allows retry without duplicating clipboard feedback state', async () => {
  const { store, paste } = await setup()
  await store.setter(runPasteSpecialPanelAtom, 'open')
  await store.setter(runPasteSpecialPanelAtom, { field: 'arithmetic', value: 'divide' })
  paste.mockRejectedValueOnce(new Error('CLIPBOARD_CUT_SPECIAL'))
  const input = { action: 'apply' as const, read: async () => ({ text: '2' }) }
  expect(await store.setter(runPasteSpecialPanelAtom, input)).toBe(false)
  expect(store.getter(pasteSpecialPanelAtom)).toMatchObject({
    arithmetic: 'divide',
    busy: false,
    error: expect.stringContaining('requires Copy'),
  })
  expect(await store.setter(runPasteSpecialPanelAtom, input)).toBe(true)
  expect(paste).toHaveBeenCalledTimes(2)
})

test('a changed selection cannot silently become the panel target', async () => {
  const { store, paste } = await setup()
  await store.setter(runPasteSpecialPanelAtom, 'open')
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  const read = vi.fn(async () => ({ text: '2' }))
  expect(await store.setter(runPasteSpecialPanelAtom, { action: 'apply', read })).toBe(false)
  expect(store.getter(pasteSpecialPanelAtom).error).toContain('Selection changed')
  expect(read).not.toHaveBeenCalled()
  expect(paste).not.toHaveBeenCalled()
  await store.setter(runPasteSpecialPanelAtom, 'close')
  expect(store.getter(pasteSpecialPanelAtom).target).toBeNull()
})

test('in-flight clipboard work blocks repeated apply, option changes and closing', async () => {
  const { store, paste } = await setup()
  let finish!: (value: { text: string }) => void
  await store.setter(runPasteSpecialPanelAtom, 'open')
  const pending = store.setter(runPasteSpecialPanelAtom, {
    action: 'apply',
    read: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  expect(store.getter(pasteSpecialPanelAtom).busy).toBe(true)
  expect(await store.setter(runPasteSpecialPanelAtom, 'close')).toBe(false)
  expect(await store.setter(runPasteSpecialPanelAtom, { field: 'transpose', value: true })).toBe(
    false,
  )
  expect(
    await store.setter(runPasteSpecialPanelAtom, {
      action: 'apply',
      read: async () => ({ text: '9' }),
    }),
  ).toBe(false)
  finish({ text: '2' })
  expect(await pending).toBe(true)
  expect(paste).toHaveBeenCalledTimes(1)
})
