import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import * as lite from '../../excel-wasm/lite/einfach_wasm.js'
import * as full from '../../excel-wasm/full/einfach_wasm.js'

for (const [variant, engine] of [['lite', lite], ['full', full]] as const) {
  describe(`${variant} actual diagonal boundary`, () => {
    beforeAll(() => engine.initSync({ module: readFileSync(new NodeURL(
      `../../excel-wasm/${variant}/einfach_wasm_bg.wasm`, import.meta.url)) }))

    test('range diagonals persist without neighbouring writes and have one atomic undo', () => {
      const book = new engine.WasmWorkbook(), reopened = new engine.WasmWorkbook()
      try {
        book.bulk_import_cells([{ sheet: 0, row: 1, col: 1, kind: 'text', value: 'H2O',
          format: { fontSize: 24, shrinkToFit: true }, richText: [
            { text: 'H', format: {} }, { text: '2', format: { fontBaseline: 'subscript' } },
            { text: 'O', format: {} },
          ] }])
        const before = book.snapshot_persistence_v1()
        book.history_clear('fixture')
        book.patch_range_borders(0, 1, 1, 2, 2, { preset: 'diagonal', style: 'double', color: '#c00000' })
        const after = book.snapshot_persistence_v1()
        expect(after.cells).toEqual(before.cells)
        expect(after.richText).toEqual(before.richText)
        const styles = after.formats[0].cellStyles
        expect(styles.map((entry: { addr: string }) => entry.addr).sort()).toEqual(['B2', 'B3', 'C2', 'C3'])
        for (const entry of styles) expect(entry.format.borders).toEqual({
          diagUp: { style: 'double', color: '#c00000' }, diagDown: { style: 'double', color: '#c00000' },
        })
        reopened.restore_persistence_v1(after)
        expect(reopened.snapshot_persistence_v1()).toEqual(after)
        expect(book.history_apply('undo')).toBe(true)
        expect(book.snapshot_persistence_v1()).toEqual(before)
        expect(book.history_apply('undo')).toBe(false)
        expect(book.history_apply('redo')).toBe(true)
        expect(book.snapshot_persistence_v1()).toEqual(after)
      } finally { book.free(); reopened.free() }
    })

    test('invalid diagonal import and sparse patch reject before any cell or history change', () => {
      const book = new engine.WasmWorkbook()
      try {
        book.bulk_import_cells([{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Kept' }])
        const before = book.snapshot_persistence_v1()
        for (const borders of [
          { diagDown: { style: 'unknown' } },
          { diagUp: { style: 'thin', color: 'red' } },
          { diagUp: { style: 'thin' }, diagDown: { style: 'double' } },
        ]) {
          expect(() => book.patch_format_selection({ sheet: 0, targets: [
            { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2, scope: 'cell' },
          ], patch: { borders, bold: true } })).toThrow()
          expect(book.snapshot_persistence_v1()).toEqual(before)
          expect(() => book.bulk_import_cells([
            { sheet: 0, row: 0, col: 0, kind: 'text', value: 'Must not write' },
            { sheet: 0, row: 2, col: 2, kind: 'text', value: 'Invalid', format: { borders } },
          ])).toThrow()
          expect(book.snapshot_persistence_v1()).toEqual(before)
          expect(book.history_apply('undo')).toBe(false)
        }
      } finally { book.free() }
    })
  })
}
