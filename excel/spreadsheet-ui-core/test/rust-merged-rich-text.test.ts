import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import * as lite from '../../excel-wasm/lite/einfach_wasm.js'
import * as full from '../../excel-wasm/full/einfach_wasm.js'
import { readMergeProjection } from '../src/rust-workbook/merge-projection'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

for (const [variant, engine] of [['lite', lite], ['full', full]] as const) {
  describe(`${variant} native merged rich-text projection`, () => {
    beforeAll(() => engine.initSync({ module: readFileSync(new NodeURL(
      `../../excel-wasm/${variant}/einfach_wasm_bg.wasm`, import.meta.url)) }))

    test('single-cell and off-window merge snapshots retain the same character formats', () => {
      const book = new engine.WasmWorkbook()
      const runs = [{ text: 'x', format: { fontBaseline: 'normal', bold: true } },
        { text: '2', format: { fontBaseline: 'subscript', color: '#FF0000' } }]
      try {
        book.bulk_import_cells([{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'x2', richText: runs }])
        expect(book.merge_cells(0, 0, 0, 0, 3, 'merge', false)).toBe(true)
        const before = book.snapshot_persistence_v1()
        expect(book.snapshotCell(0, 'a1')).toMatchObject({ display: 'x2', richText: runs })
        expect(book.snapshotCell(0, 'B1').richText).toBeUndefined()
        for (const colStart of [0, 2]) {
          const projection = readMergeProjection(book as unknown as WasmWorkbook, 0,
            { rowStart: 0, rowEnd: 1, colStart, colEnd: 3 })
          expect(projection.mergeAnchors).toMatchObject([{ row: 0, col: 0,
            displayValue: 'x2', richText: runs, mergedSpan: { rows: 1, cols: 4 } }])
        }
        expect(book.snapshot_persistence_v1()).toEqual(before)
      } finally { book.free() }
    })
  })
}
