import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import * as lite from '../../excel-wasm/lite/einfach_wasm.js'
import * as full from '../../excel-wasm/full/einfach_wasm.js'
import { CELL_FILL_PATTERNS } from '../src/contracts/cell-fill'

for (const [variant, engine] of [['lite', lite], ['full', full]] as const) {
  describe(`${variant} actual pattern boundary`, () => {
    beforeAll(() => engine.initSync({ module: readFileSync(new NodeURL(
      `../../excel-wasm/${variant}/einfach_wasm_bg.wasm`, import.meta.url)) }))

    test('all patterns preserve native facts and one undo restores each complete two-color patch', () => {
      const book = new engine.WasmWorkbook(), reopened = new engine.WasmWorkbook()
      try {
        book.bulk_import_cells([{ sheet: 0, row: 1, col: 1, kind: 'formula', value: '=25/2',
          format: { fontSize: 24, shrinkToFit: true, fgColor: '#123abc',
            numberFormat: { kind: 'accounting', symbol: '$', digits: 2 } } }])
        book.history_clear('fixture')
        for (const pattern of CELL_FILL_PATTERNS) {
          const before = book.snapshot_persistence_v1()
          book.patch_format_selection({ sheet: 0, targets: [
            { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2, scope: 'cell' },
          ], patch: { fill: { kind: 'pattern', pattern, foreground: '#c00000' }, bgColor: '#fff2cc' } })
          const after = book.snapshot_persistence_v1()
          expect(after.cells).toEqual(before.cells)
          const styles = after.formats[0].cellStyles
          expect(styles.map((entry: { addr: string }) => entry.addr).sort()).toEqual(['B2', 'B3', 'C2', 'C3'])
          for (const entry of styles) expect(entry.format).toMatchObject({
            fill: { kind: 'pattern', pattern, foreground: '#c00000' }, bgColor: '#fff2cc',
          })
          expect(styles.find((entry: { addr: string }) => entry.addr === 'B2').format).toMatchObject({
            fgColor: '#123abc', fontSize: 24, shrinkToFit: true,
            numberFormat: { kind: 'accounting', symbol: '$', digits: 2 },
          })
          reopened.restore_persistence_v1(after)
          expect(reopened.snapshot_persistence_v1()).toEqual(after)
          expect(book.history_apply('undo')).toBe(true)
          expect(book.snapshot_persistence_v1()).toEqual(before)
          expect(book.history_apply('redo')).toBe(true)
          expect(book.snapshot_persistence_v1()).toEqual(after)
        }
      } finally { book.free(); reopened.free() }
    })

    test('sparse row styles keep explicit cell clears distinct from inheritance', () => {
      const book = new engine.WasmWorkbook(), reopened = new engine.WasmWorkbook()
      try {
        const target = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 3 }
        book.patch_format_selection({ sheet: 0, targets: [{ ...target, scope: 'row' }],
          patch: { fill: { kind: 'pattern', pattern: 'gray125', foreground: '#c00000' }, bgColor: '#fff2cc' } })
        const before = book.snapshot_persistence_v1()
        book.history_clear('fixture')
        book.patch_format_selection({ sheet: 0, targets: [{ ...target, colEnd: 0, scope: 'cell' }],
          patch: { fill: null, bgColor: null } })
        const after = book.snapshot_persistence_v1()
        expect(after.formats[0].rowStyles).toHaveLength(1)
        expect(after.formats[0].cellStyles).toEqual([{ addr: 'A1', format: { fill: null, bgColor: null } }])
        reopened.restore_persistence_v1(after)
        expect(reopened.snapshot_persistence_v1()).toEqual(after)
        expect(book.history_apply('undo')).toBe(true)
        expect(book.snapshot_persistence_v1()).toEqual(before)
        expect(book.history_apply('undo')).toBe(false)
      } finally { book.free(); reopened.free() }
    })

    test('invalid descriptors reject an entire patch or import without partial writes or history', () => {
      const book = new engine.WasmWorkbook()
      try {
        book.bulk_import_cells([{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Kept' }])
        book.history_clear('fixture')
        const before = book.snapshot_persistence_v1()
        for (const fill of [
          { kind: 'pattern', pattern: 'unknown', foreground: '#123456' },
          { kind: 'pattern', pattern: 'lightDown', foreground: 'red' },
          { kind: 'pattern', pattern: 'lightUp', foreground: '#123456', background: '#ffffff' },
        ]) {
          expect(() => book.patch_format_selection({ sheet: 0, targets: [
            { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2, scope: 'cell' },
          ], patch: { fill, bold: true } })).toThrow()
          expect(() => book.bulk_import_cells([
            { sheet: 0, row: 0, col: 0, kind: 'text', value: 'Must not write' },
            { sheet: 0, row: 2, col: 2, kind: 'text', value: 'Invalid', format: { fill } },
          ])).toThrow()
          expect(book.snapshot_persistence_v1()).toEqual(before)
          expect(book.history_apply('undo')).toBe(false)
        }
      } finally { book.free() }
    })
  })
}
