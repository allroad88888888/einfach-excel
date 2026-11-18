import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import * as lite from '../../excel-wasm/lite/einfach_wasm.js'
import * as full from '../../excel-wasm/full/einfach_wasm.js'

for (const [variant, engine] of [['lite', lite], ['full', full]] as const) {
  describe(`native inline import via ${variant} WASM`, () => {
    beforeAll(() => engine.initSync({ module: readFileSync(new NodeURL(
      `../../excel-wasm/${variant}/einfach_wasm_bg.wasm`, import.meta.url)) }))
    const runs = [{ text: 'x', format: {} },
      { text: '2', format: { fontBaseline: 'superscript', color: '#ff0000' } }]
    const entry = { sheet: 0, row: 0, col: 0, kind: 'text', value: 'x2', richText: runs }

    test('actual import writes ordered inline content and clears it for nontext replacements', () => {
      const book = new engine.WasmWorkbook()
      try {
        const report = book.bulk_import_cells([entry,
          { ...entry, col: 1 }, { sheet: 0, row: 0, col: 1, kind: 'number', value: 8 },
          { sheet: 0, row: 0, col: 2, kind: 'text', value: 'before' }, { ...entry, col: 2 }])
        expect(report).toMatchObject({ accepted: 5, errors: 0 })
        const snapshot = book.snapshot_persistence_v1()
        expect(snapshot.richText).toHaveLength(2)
        for (const cell of snapshot.richText) {
          expect(cell.runs).toEqual([{ text: 'x', format: {} },
            { text: '2', format: { fontBaseline: 'superscript', color: '#FF0000' } }])
        }
        expect(snapshot.cells[1]).toMatchObject({ col: 1, kind: 'number', value: 8 })
      } finally { book.free() }
    })

    test('invalid inline payload rejects the whole call before preceding legacy entries mutate', () => {
      const book = new engine.WasmWorkbook()
      try {
        book.bulk_import_cells([entry])
        const before = book.snapshot_persistence_v1()
        for (const invalid of [
          { ...entry, value: 'mismatch' }, { ...entry, kind: 'number', value: 2 },
          { ...entry, richText: [{ text: 'x2', format: { fontBaseline: 'invalid' } }] },
          { ...entry, richText: [{ text: 'x2', format: { fontSize: 0 } }] },
          { ...entry, sheet: 9 }, { ...entry, row: 1_048_576 },
        ]) {
          expect(() => book.bulk_import_cells([
            { sheet: 0, row: 0, col: 0, kind: 'text', value: 'must not write' }, invalid,
          ])).toThrow()
          expect(book.snapshot_persistence_v1()).toEqual(before)
        }
      } finally { book.free() }
    })
  })
}
