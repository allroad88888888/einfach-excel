import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmBase = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
const patches = [
  { name: 'text', patch: { bold: true, italic: true, underline: true } },
  { name: 'colors', patch: { fgColor: '#c00000', bgColor: '#fff2cc' } },
  { name: 'numbers', patch: { numberFormat: { kind: 'percent', digits: 0 } } },
]

for (const variant of ['lite', 'full']) for (const scenario of patches) {
  test(`${variant} ${scenario.name} multi-area format persists and undoes once`, async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async ({ url, patch }) => {
      const wasm = await import(url)
      await wasm.default()
      const book = new wasm.WasmWorkbook(), restored = new wasm.WasmWorkbook()
      try {
        book.set_cell_input(0, 'A1', '0.25')
        book.set_cell_input(0, 'B1', 'gap')
        book.set_cell_input(0, 'C1', '=A1*2')
        book.history_clear('')
        const inspect = (target: typeof book) => ({
          first: target.getCellDisplay(0, 'A1'), last: target.getCellDisplay(0, 'C1'),
          firstFormatted: target.snapshotCell(0, 'A1').formattedDisplay,
          lastFormatted: target.snapshotCell(0, 'C1').formattedDisplay,
          formula: target.snapshotCell(0, 'C1').formula,
          gap: target.getCellDisplay(0, 'B1'),
          styles: target.snapshot_format_range(0, 0, 0, 0, 2).cellStyles,
        })
        const before = inspect(book)
        book.patch_format_selection({ sheet: 0, patch, targets: [
          { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0, scope: 'cell' },
          { rowStart: 0, rowEnd: 0, colStart: 2, colEnd: 2, scope: 'cell' },
        ] })
        const after = inspect(book), count = book.history_state().undoCount
        restored.restore_persistence_v1(JSON.parse(JSON.stringify(book.snapshot_persistence_v1())))
        const persisted = inspect(restored)
        book.history_apply('undo')
        const undone = inspect(book), undoCount = book.history_state().undoCount
        book.history_apply('redo')
        return { before, after, persisted, undone, redone: inspect(book), count, undoCount }
      } finally { restored.free(); book.free() }
    }, { url: `${wasmBase}${variant}/einfach_wasm.js`, patch: scenario.patch })
    expect(result.count).toBe(1)
    expect(result.undoCount).toBe(0)
    // getCellDisplay 是原始值显示；与 React 相同的数字格式结果在 snapshotCell 中。
    expect(result.after.first).toBe('0.25')
    expect(result.after.last).toBe('0.5')
    expect(result.after.firstFormatted).toBe(scenario.name === 'numbers' ? '25%' : undefined)
    expect(result.after.lastFormatted).toBe(scenario.name === 'numbers' ? '50%' : undefined)
    expect(result.after.formula).toBe('=A1*2')
    expect(result.after.gap).toBe('gap')
    for (const address of ['A1', 'C1']) {
      const style = result.after.styles.find((entry: { addr: string }) => entry.addr === address)
      expect(style.format).toMatchObject(scenario.patch)
    }
    expect(result.after.styles.find((entry: { addr: string }) => entry.addr === 'B1'))
      .toEqual(result.before.styles.find((entry: { addr: string }) => entry.addr === 'B1'))
    expect(result.persisted).toEqual(result.after)
    expect(result.undone).toEqual(result.before)
    expect(result.redone).toEqual(result.after)
  })
}
