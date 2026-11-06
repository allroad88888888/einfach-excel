import { expect, test } from 'vitest'
import { fromRustDrawing, toRustDrawing } from '../../src/rust-workbook/drawings/sheet-refs'
import type { RustWorkbookSheet } from '../../src'
import { drawing } from './fixture'

const sheets = new Map<string, RustWorkbookSheet>([
  ['s', { id: 's', index: 0, name: 'Sheet1', key: '1' }],
  ['data', { id: 'data', index: 1, name: 'Data', key: '2' }],
  ['old', { id: 'old', index: -1, name: 'Old', key: '3' }],
])
const cells = { startRow: 0, startCol: 0, endRow: 4, endCol: 1 }

test('Rust sheet keys become sheet ids, including deleted sheets kept for undo', () => {
  const read = fromRustDrawing({ ...drawing('c'), refs: [cells, { ...cells, sheet: 2 },
    { ...cells, sheet: 3 }, { ...cells, sheet: 99 }, null] }, sheets)
  expect(read.refs).toEqual([cells, { ...cells, sheetId: 'data' }, { ...cells, sheetId: 'old' },
    null, null])
})

test('sheet ids become Rust keys; the owner sheet is implicit and dead sheets are rejected', () => {
  const written = toRustDrawing({ ...drawing('c'), refs: [cells, { ...cells, sheetId: 's' },
    { ...cells, sheetId: 'data' }, null] }, 's', sheets)
  expect(written.refs).toEqual([cells, cells, { ...cells, sheet: 2 }, null])
  for (const sheetId of ['old', 'missing'])
    expect(() => toRustDrawing({ ...drawing('c'), refs: [{ ...cells, sheetId }] }, 's', sheets))
      .toThrow('The object data worksheet does not exist.')
})
