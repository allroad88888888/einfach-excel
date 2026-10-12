import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import { selectionCellCountAtom, setMultiRegionSelectionAtom, setSelectionBoundsAtom } from '../src'
import { countSelectionCells } from '../src/selection/cell-count'
import type { CellRange } from '../src/shared'

const rect = (rowStart: number, rowEnd: number, colStart: number, colEnd: number): CellRange =>
  ({ rowStart, rowEnd, colStart, colEnd })

test('counts disjoint, touching, nested and overlapping selection geometry without duplicates', () => {
  expect(countSelectionCells([])).toBe(0)
  expect(countSelectionCells([rect(0, 1, 0, 1), rect(1, 2, 1, 2)])).toBe(7)
  expect(countSelectionCells([rect(0, 1, 0, 1), rect(2, 3, 0, 1)])).toBe(8)
  expect(countSelectionCells([rect(0, 8, 0, 8), rect(2, 3, 2, 3), rect(0, 8, 0, 8)])).toBe(81)
  expect(countSelectionCells([rect(0, 1048575, 0, 16383)])).toBe(17_179_869_184)
})

test('derived count updates through existing selection atoms and keeps worksheet identities separate', () => {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(setMultiRegionSelectionAtom, { regions: [
    { kind: 'row', sheetId: 's', rowAnchor: 0, rowFocus: 1 },
    { kind: 'column', sheetId: 's', colAnchor: 0, colFocus: 1 },
  ] })
  expect(store.getter(selectionCellCountAtom)).toBe(212)
  store.setter(setMultiRegionSelectionAtom, { regions: [
    { kind: 'all', sheetId: 's' }, { kind: 'all', sheetId: 'second' },
  ] })
  expect(store.getter(selectionCellCountAtom)).toBe(1600)
})

test('small-grid random rectangles agree with a dense coordinate oracle', () => {
  let seed = 11
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % 9 }
  for (let trial = 0; trial < 100; trial++) {
    const ranges = Array.from({ length: 12 }, () => {
      const row = next(), row2 = next(), col = next(), col2 = next()
      return rect(
        Math.min(row, row2), Math.max(row, row2), Math.min(col, col2), Math.max(col, col2),
      )
    })
    const cells = new Set<string>()
    for (const range of ranges)
      for (let row = range.rowStart; row <= range.rowEnd; row++)
        for (let col = range.colStart; col <= range.colEnd; col++) cells.add(`${row}:${col}`)
    expect(countSelectionCells(ranges)).toBe(cells.size)
  }
})
