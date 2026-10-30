import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import {
  activateSheetTabAtom,
  activeSheetZoomAtom,
  initializeWorkbookDocumentAtom,
  setSheetZoomAtom,
} from '../src'

function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 'a', index: 0, name: 'A', rowCount: 10, colCount: 4 },
    { id: 'b', index: 1, name: 'B', rowCount: 10, colCount: 4 },
  ] })
  return store
}

test('steps snap to the 10% grid and clamp to 10%-400%', () => {
  const store = setup()
  expect(store.getter(activeSheetZoomAtom)).toBe(100)
  store.setter(setSheetZoomAtom, { kind: 'set', percent: 115 })
  store.setter(setSheetZoomAtom, { kind: 'step', direction: 1 })
  expect(store.getter(activeSheetZoomAtom)).toBe(120)
  store.setter(setSheetZoomAtom, { kind: 'set', percent: 115 })
  store.setter(setSheetZoomAtom, { kind: 'step', direction: -1 })
  expect(store.getter(activeSheetZoomAtom)).toBe(110)
  store.setter(setSheetZoomAtom, { kind: 'set', percent: 9000 })
  expect(store.getter(activeSheetZoomAtom)).toBe(400)
  store.setter(setSheetZoomAtom, { kind: 'step', direction: 1 })
  expect(store.getter(activeSheetZoomAtom)).toBe(400)
  store.setter(setSheetZoomAtom, { kind: 'set', percent: 1 })
  expect(store.getter(activeSheetZoomAtom)).toBe(10)
  store.setter(setSheetZoomAtom, { kind: 'set', percent: Number.NaN })
  expect(store.getter(activeSheetZoomAtom)).toBe(100)
})

test('each sheet keeps its own zoom and a new workbook starts at 100%', () => {
  const store = setup()
  store.setter(setSheetZoomAtom, { kind: 'set', percent: 150 })
  store.setter(activateSheetTabAtom, { sheetId: 'b' })
  expect(store.getter(activeSheetZoomAtom)).toBe(100)
  store.setter(setSheetZoomAtom, { kind: 'set', percent: 75 })
  store.setter(activateSheetTabAtom, { sheetId: 'a' })
  expect(store.getter(activeSheetZoomAtom)).toBe(150)
  store.setter(setSheetZoomAtom, { kind: 'reset' })
  expect(store.getter(activeSheetZoomAtom)).toBe(100)
  store.setter(activateSheetTabAtom, { sheetId: 'b' })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Next', sheets: [
    { id: 'b', index: 0, name: 'B', rowCount: 10, colCount: 4 },
  ] })
  expect(store.getter(activeSheetZoomAtom)).toBe(100)
})
