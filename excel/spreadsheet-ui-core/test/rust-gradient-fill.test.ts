import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import * as lite from '../../excel-wasm/lite/einfach_wasm.js'
import * as full from '../../excel-wasm/full/einfach_wasm.js'

for (const [variant, engine] of [['lite', lite], ['full', full]] as const) {
  describe(`${variant} actual gradient boundary`, () => {
    beforeAll(() => engine.initSync({ module: readFileSync(new NodeURL(
      `../../excel-wasm/${variant}/einfach_wasm_bg.wasm`, import.meta.url)) }))

    test('linear and path fills retain exact facts through persistence and a single complete undo', () => {
      const book = new engine.WasmWorkbook(), reopened = new engine.WasmWorkbook()
      try {
        book.bulk_import_cells([{ sheet: 0, row: 1, col: 1, kind: 'formula', value: '=25/2',
          format: { fontSize: 24, fgColor: '#123abc', numberFormat: { kind: 'accounting', symbol: '$', digits: 2 } } }])
        book.history_clear('fixture')
        const stops = [{ position: 1, color: '#0000ff' }, { position: 0.5, color: '#00ff00' },
          { position: 0, color: '#ff0000' }, { position: 0.5, color: '#ff00ff' }]
        for (const fill of [
          { kind: 'linear-gradient', degree: -450, stops },
          { kind: 'path-gradient', left: 0.8, right: 0.2, top: 0.9, bottom: 0.1, stops },
          { kind: 'linear-gradient', degree: 1e100, stops: [] },
          { kind: 'path-gradient', left: 0, right: 1, top: 0, bottom: 1,
            stops: Array.from({ length: 256 }, (_, i) => ({ position: i / 255, color: '#abcdef' })) },
        ]) {
          const before = book.snapshot_persistence_v1()
          book.patch_format_selection({ sheet: 0, targets: [
            { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2, scope: 'cell' },
          ], patch: { fill, bgColor: '#ff0000' } })
          const after = book.snapshot_persistence_v1()
          expect(after.cells).toEqual(before.cells)
          const styles = after.formats[0].cellStyles
          expect(styles.map((entry: { addr: string }) => entry.addr).sort()).toEqual(['B2', 'B3', 'C2', 'C3'])
          for (const entry of styles) expect(entry.format).toMatchObject({ fill, bgColor: '#ff0000' })
          expect(styles.find((entry: { addr: string }) => entry.addr === 'B2').format).toMatchObject({
            fontSize: 24, fgColor: '#123abc', numberFormat: { kind: 'accounting', symbol: '$', digits: 2 },
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

    test('invalid gradient payloads reject whole patches and imports without a partial write or history', () => {
      const book = new engine.WasmWorkbook()
      try {
        book.bulk_import_cells([{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Kept' }])
        book.history_clear('fixture')
        const before = book.snapshot_persistence_v1()
        for (const fill of [
          { kind: 'linear-gradient', degree: Infinity, stops: [] },
          { kind: 'linear-gradient', degree: 0, stops: [{ position: -0.1, color: '#123456' }] },
          { kind: 'path-gradient', left: 0, right: 2, top: 0, bottom: 0, stops: [] },
          { kind: 'path-gradient', left: 0, top: 0, bottom: 0, stops: [] },
          { kind: 'linear-gradient', degree: 0, stops: Array(257).fill({ position: 0, color: '#abcdef' }) },
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
