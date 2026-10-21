import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, editingDraftAtom, endPointerSelectionAtom, formatPainterAtom,
  initializeWorkbookDocumentAtom, pointerSessionAtom, runFormatPainterAtom,
  runVisibleProjectionAtom, selectionRegionsAtom, selectCellAtom, startEditingAtom,
  startPointerSelectionAtom, syncFormulaReferenceCaretAtom, updatePointerSelectionAtom,
} from '../../src'
import { createTestRustWorkbookConnection } from '../support/rust-workbook-connection'

async function setup() {
  const capture = vi.fn(async () => ({ text: '', rows: 1, cols: 1, cut: false, token: 'brush' }))
  const { store } = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
    captureClipboard: capture,
    readVisibleProjection: async (request) => ({ ...request, revision: 0, cells: [] }),
  }) })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 20, colCount: 20 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 } })
  return { store, capture }
}

test('modifier drag in reference picking updates the formula without changing the multi-selection', async () => {
  const { store } = await setup()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 9, col: 1 } })
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 8, col: 1 }, append: true })
  store.setter(endPointerSelectionAtom)
  const before = store.getter(selectionRegionsAtom)
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 8, col: 1 }, draft: '=SUM(', source: 'cell' })
  store.setter(syncFormulaReferenceCaretAtom, 5)
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 2, col: 1 }, append: true })
  store.setter(updatePointerSelectionAtom, { sheetId: 's', coord: { row: 4, col: 2 } })
  expect(store.getter(editingDraftAtom)).toBe('=SUM(B3:C5')
  expect(store.getter(selectionRegionsAtom)).toEqual(before)
  expect(store.getter(pointerSessionAtom).interaction).not.toHaveProperty('append')
})

test('an armed format painter receives a continuous target even with a modifier key', async () => {
  const { store, capture } = await setup()
  expect(await store.setter(runFormatPainterAtom, 'arm')).toBe(true)
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 4, col: 4 }, append: true })
  store.setter(updatePointerSelectionAtom, { sheetId: 's', coord: { row: 6, col: 6 } })
  expect(store.getter(selectionRegionsAtom)).toHaveLength(1)
  expect(store.getter(pointerSessionAtom).interaction).not.toHaveProperty('append')
  expect(store.getter(formatPainterAtom).mode).toBe('armed')
  expect(capture).toHaveBeenCalledOnce()
})
