import { expect, test } from 'vitest'
import { applyVisibleFormats } from '../src/rust-workbook/format-projection'
import { cloneCell } from '../src/backend/projection-helpers'
import type { DisplayCell } from '../src/backend'

const range = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
const source: DisplayCell = { row: 0, col: 0, displayValue: '-10', valueKind: 'number', numericValue: -10 }
const bar = { left: 0, width: 25, axis: 25, color: '#ff0000' }
const snapshot = { cellStyles: [], rowStyles: [], columnStyles: [], dataBars: [{ addr: 'A1', ...bar }] }

test('native data-bar geometry is transported independently of base cell style', () => {
  const [cell] = applyVisibleFormats([source], range, snapshot)
  expect(cell.dataBar).toEqual(bar)
  expect(cell.format).toBeUndefined()
  expect(cell.displayValue).toBe('-10')
  expect(source.dataBar).toBeUndefined()
  const clone = cloneCell(cell)
  expect(clone.dataBar).toEqual(bar)
  expect(clone.dataBar).not.toBe(cell.dataBar)
  const [cleared] = applyVisibleFormats([cell], range, { ...snapshot, dataBars: [] })
  expect(cleared.dataBar).toBeUndefined()
})

test.each([{ width: Infinity }, { left: -1 }, { width: 101 }, { axis: NaN }, { color: 'url(bad)' }])(
  'invalid native geometry rejects the projection: %o', (invalid) => {
    expect(() => applyVisibleFormats([source], range, { ...snapshot,
      dataBars: [{ addr: 'A1', ...bar, ...invalid }],
    })).toThrow('invalid data-bar geometry')
  },
)
