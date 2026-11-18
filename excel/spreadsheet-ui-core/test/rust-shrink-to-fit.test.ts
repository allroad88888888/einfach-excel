import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import * as lite from '../../excel-wasm/lite/einfach_wasm.js'
import * as full from '../../excel-wasm/full/einfach_wasm.js'

for (const [variant, engine] of [['lite', lite], ['full', full]] as const) {
  describe(`${variant} native shrink format boundary`, () => {
    beforeAll(() => engine.initSync({ module: readFileSync(new NodeURL(
      `../../excel-wasm/${variant}/einfach_wasm_bg.wasm`, import.meta.url)) }))

    test('sparse flags survive persistence and an atomic wrap change preserves rich text and nominal size', () => {
      const book = new engine.WasmWorkbook(), reopened = new engine.WasmWorkbook()
      const runs = [{ text: 'H', format: {} }, { text: '2', format: { fontBaseline: 'subscript' } }]
      const target = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0, scope: 'cell' }
      try {
        book.bulk_import_cells([{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'H2',
          format: { fontSize: 24, wrap: true }, richText: runs }])
        book.patch_format_selection({ sheet: 0, targets: [{ ...target, scope: 'column' }],
          patch: { shrinkToFit: true } })
        book.patch_format_selection({ sheet: 0, targets: [target], patch: { shrinkToFit: false } })
        const original = book.snapshot_persistence_v1()
        expect(original.formats[0].columnStyles[0].format.shrinkToFit).toBe(true)
        expect(original.formats[0].cellStyles[0].format)
          .toMatchObject({ shrinkToFit: false, wrap: true, fontSize: 24 })
        book.history_clear('fixture')
        book.patch_format_selection({ sheet: 0, targets: [target],
          patch: { shrinkToFit: true, wrap: false } })
        const changed = book.snapshot_persistence_v1()
        expect(changed.formats[0].cellStyles[0].format)
          .toMatchObject({ shrinkToFit: true, wrap: false, fontSize: 24 })
        expect(changed.richText).toEqual(original.richText)
        expect(changed.cells).toEqual(original.cells)
        expect(book.history_apply('undo')).toBe(true)
        expect(book.snapshot_persistence_v1()).toEqual(original)
        expect(book.history_apply('undo')).toBe(false)
        expect(book.history_apply('redo')).toBe(true)
        reopened.restore_persistence_v1(book.snapshot_persistence_v1())
        expect(reopened.snapshot_persistence_v1()).toEqual(changed)
      } finally { book.free(); reopened.free() }
    })

    test('invalid flag rejects before any native range or restored document changes', () => {
      const book = new engine.WasmWorkbook()
      try {
        book.bulk_import_cells([{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'kept',
          format: { shrinkToFit: true, wrap: true, fontSize: 20 } }])
        const before = book.snapshot_persistence_v1()
        for (const shrinkToFit of ['true', 1, {}]) {
          expect(() => book.patch_format_selection({ sheet: 0,
            targets: [{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1, scope: 'cell' }],
            patch: { shrinkToFit, wrap: false } })).toThrow()
          expect(book.snapshot_persistence_v1()).toEqual(before)
          const invalid = structuredClone(before)
          invalid.formats[0].cellStyles[0].format.shrinkToFit = shrinkToFit
          expect(() => book.restore_persistence_v1(invalid)).toThrow()
          expect(book.snapshot_persistence_v1()).toEqual(before)
        }
      } finally { book.free() }
    })
  })
}
