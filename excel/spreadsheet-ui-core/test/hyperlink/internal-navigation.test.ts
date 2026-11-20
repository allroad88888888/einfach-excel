import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  activeWorkbookSheetAtom,
  beginProjectionAtom,
  externalHyperlink,
  hyperlinkNoticeAtom,
  hyperlinkPanelAtom,
  initializeWorkbookDocumentAtom,
  internalHyperlink,
  openInternalHyperlinkAtom,
  resolveProjectionAtom,
  runHyperlinkAtom,
  safeHyperlink,
  selectionSnapshotAtom,
  setRustWorkbookConnectionAtom,
  setSelectionAtom,
  type RustWorkbookConnection,
} from '../../src'

function setupWorkbook() {
  const store = createStore()
  const request = vi.fn(async () => ({}))
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [
      { id: 's1', index: 0, name: 'Sheet1', rowCount: 100, colCount: 20 },
      { id: 's2', index: 1, name: 'Sales Orders', rowCount: 100, colCount: 20 },
      { id: 's3', index: 2, name: 'HiddenSheet', rowCount: 100, colCount: 20, hidden: true },
    ],
  })
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  store.setter(setRustWorkbookConnectionAtom, connection)
  store.setter(setSelectionAtom, {
    sheetId: 's1',
    kind: 'range',
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  })
  const read = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: 's1',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
  })
  if (read.status !== 'started' || read.request.kind !== 'visible-window') {
    throw new Error('Expected projection')
  }
  store.setter(resolveProjectionAtom, {
    request: read.request,
    result: {
      ...read.request,
      revision: 1,
      cells: [{ row: 0, col: 0, displayValue: 'Jump', hyperlink: "#'Sales Orders'!B5:D10" }],
      namedRanges: [
        { name: 'SampleAmounts', target: { sheet: 1, range: [2, 1, 4, 2] } },
      ],
    },
  })
  return { store }
}

test('internalHyperlink and externalHyperlink keep strict protocol separation', () => {
  expect(internalHyperlink('#Sheet2!A1')).toBe('#Sheet2!A1')
  expect(internalHyperlink(" #'Sales Orders'!B5:D10 ")).toBe("#'Sales Orders'!B5:D10")
  expect(internalHyperlink('#SampleAmounts')).toBe('#SampleAmounts')
  expect(internalHyperlink('#')).toBeNull()
  expect(internalHyperlink('#   ')).toBeNull()
  expect(internalHyperlink('#Sheet2!\nA1')).toBeNull()
  expect(externalHyperlink('#Sheet2!A1')).toBeNull()
  expect(safeHyperlink('#Sheet2!A1')).toBe('#Sheet2!A1')
  expect(safeHyperlink('https://example.com')).toBe('https://example.com/')
  expect(safeHyperlink('javascript:alert(1)')).toBeNull()
})

test('openInternalHyperlinkAtom switches sheets, selects target range or defined name, and reports hidden/missing targets non-blockingly', async () => {
  const { store } = setupWorkbook()

  expect(store.setter(openInternalHyperlinkAtom, '#MissingSheet!A1')).toBe(false)
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('s1')
  expect(store.getter(hyperlinkNoticeAtom)).toContain('does not exist')

  expect(store.setter(openInternalHyperlinkAtom, '#HiddenSheet!A1')).toBe(false)
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('s1')
  expect(store.getter(hyperlinkNoticeAtom)).toContain('hidden')

  expect(store.setter(openInternalHyperlinkAtom, "#'Sales Orders'!B5:D10")).toBe(true)
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('s2')
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 4,
    colStart: 1,
    rowEnd: 9,
    colEnd: 3,
  })
  expect(store.getter(hyperlinkNoticeAtom)).toBe('')

  expect(store.setter(openInternalHyperlinkAtom, '#SampleAmounts')).toBe(true)
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 2,
    colStart: 1,
    rowEnd: 4,
    colEnd: 2,
  })
})

test('dialog jump action closes on valid internal destination and keeps draft open on hidden target', async () => {
  const { store } = setupWorkbook()
  expect(await store.setter(runHyperlinkAtom, 'open')).toBe(true)
  await store.setter(runHyperlinkAtom, { url: '#HiddenSheet!B2' })
  expect(await store.setter(runHyperlinkAtom, 'jump')).toBe(false)
  expect(store.getter(hyperlinkPanelAtom).open).toBe(true)
  expect(store.getter(hyperlinkPanelAtom).error).toContain('hidden')

  await store.setter(runHyperlinkAtom, { url: '#SampleAmounts' })
  expect(await store.setter(runHyperlinkAtom, 'jump')).toBe(true)
  expect(store.getter(hyperlinkPanelAtom).open).toBe(false)
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('s2')
})
