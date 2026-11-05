import { expect, test } from 'vitest'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import { applyVisibleFormats } from '../src/rust-workbook/format-projection'
import { validateProjectionResult } from '../src/projection/contracts'
import type { RustWorkbookDefinition } from '../src'

const definition: RustWorkbookDefinition = {
  title: 'Book', defaults: { rowHeight: 32, colWidth: 140, fontSize: 14 },
  sheets: [{ id: 's', name: 'Sheet', rowCount: 1_048_576, colCount: 16_384, defaults: { colWidth: 180 } }],
  *createImportChunks() { yield [] },
}
test('native definitions copy only sparse defaults with sheet overrides ahead of host options', () => {
  const snapshot = snapshotRustWorkbookDefinition(definition, { rowHeight: 40, colWidth: 200 })
  expect(snapshot.sheets[0].defaults).toEqual({ rowHeight: 40, colWidth: 180, fontSize: 14 })
  expect(Object.isFrozen(snapshot.sheets[0].defaults)).toBe(true)
  expect(snapshot.sheets[0].rowHeights).toBeUndefined()
  expect(definition.defaults?.rowHeight).toBe(32)
})
test.each([
  { rowHeight: 0 }, { rowHeight: 513 }, { colWidth: 39 }, { colWidth: 1.5 }, { fontSize: 513 },
])(
  'rejects invalid defaults before initialization: %o', defaults => {
    expect(() => snapshotRustWorkbookDefinition(definition, defaults)).toThrow()
  },
)
test('visible formats inherit native font size only where explicit styles leave it unset', () => {
  const cells = applyVisibleFormats([], { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 2 }, {
    defaultFontSize: 18, rowStyles: [], columnStyles: [], cellStyles: [
      { addr: 'B1', format: { fontSize: 24 } }, { addr: 'C1', format: { fontSize: null } },
    ],
  })
  expect(cells.map(cell => cell.format?.fontSize)).toEqual([18, 24, 18])
})
test('invalid transported defaults cannot become a published projection', () => {
  expect(validateProjectionResult({ kind: 'visible-window', sheetId: 's', requestId: 1, cells: [],
    window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }, defaults: { rowHeight: -5 },
  }).ok).toBe(false)
})
