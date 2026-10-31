import { expect, it } from 'vitest'
import { centerAcrossRun, type DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import { cellFormatStyle } from '../src/cell-format-style'
import { centerAcrossSpanWidth, centerAcrossStyles } from '../src/center-across-style'

const cell = (col: number, displayValue: string): DisplayCell =>
  ({ row: 0, col, displayValue, format: { align: 'centerAcross' } })
const lookup = (cells: DisplayCell[]) => (row: number, col: number) =>
  cells.find(item => item.row === row && item.col === col)

it('maps centerAcross to a centered td fallback', () => {
  expect(cellFormatStyle({ align: 'centerAcross' })?.textAlign).toBe('center')
})

it('spans the anchor over consecutive empty centerAcross cells and stops at content', () => {
  const cells = [cell(0, 'T'), cell(1, ''), cell(2, ''), cell(3, 'X'), cell(4, '')]
  const at = lookup(cells)
  expect(centerAcrossRun(at, 0, 0, 4)).toEqual({ colStart: 0, colEnd: 2 })
  expect(centerAcrossRun(at, 0, 1, 4)).toBeNull()
  expect(centerAcrossRun(at, 0, 3, 4)).toEqual({ colStart: 3, colEnd: 4 })
  expect(centerAcrossRun(at, 0, 0, 1)).toEqual({ colStart: 0, colEnd: 1 })
})

it('formula cells, merged cells and plain-aligned cells end the run', () => {
  const formula = { ...cell(1, ''), formula: '=""' }
  const merged = { ...cell(1, ''), mergeAnchor: { row: 0, col: 0 } }
  const plain: DisplayCell = { row: 0, col: 1, displayValue: '', format: { align: 'center' } }
  for (const blocker of [formula, merged, plain]) {
    expect(centerAcrossRun(lookup([cell(0, 'T'), blocker]), 0, 0, 3))
      .toEqual({ colStart: 0, colEnd: 0 })
  }
})

it('sums window-relative widths and sizes the text block inside the padding', () => {
  const width = centerAcrossSpanWidth({ colStart: 3, colEnd: 5 }, 2, [10, 100, 0, 80, 60])
  expect(width).toBe(180)
  expect(centerAcrossStyles(width).content).toMatchObject({ width: 166, textAlign: 'center' })
  expect(centerAcrossStyles(width).cell).toMatchObject({ overflow: 'visible', position: 'relative' })
})
