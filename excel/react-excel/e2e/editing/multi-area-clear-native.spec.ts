import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmBase = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`

for (const variant of ['lite', 'full']) for (const mode of ['contents', 'formats', 'all']) {
  test(`${variant} multi-area ${mode} persists and has one native undo`, async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async ({ url, mode: clearMode }) => {
      const wasm = await import(url)
      await wasm.default()
      const book = new wasm.WasmWorkbook(), restored = new wasm.WasmWorkbook()
      try {
        book.set_cell_input(0, 'A1', '7')
        book.set_cell_input(0, 'B1', 'gap')
        book.set_cell_input(0, 'C1', '=A1*2')
        book.patch_format_range(0, 0, 0, 0, 2, { bold: true }, 'cell')
        book.history_clear('')
        const inspect = (target: typeof book) => ({
          first: target.getCellDisplay(0, 'A1'), formula: target.snapshotCell(0, 'C1').formula,
          gap: target.getCellDisplay(0, 'B1'),
          styles: target.snapshot_format_range(0, 0, 0, 0, 2).cellStyles,
        })
        const before = inspect(book)
        const affected = book.clear_selection({ sheet: 0, mode: clearMode, targets: [
          { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0, scope: 'cell' },
          { rowStart: 0, rowEnd: 0, colStart: 2, colEnd: 2, scope: 'cell' },
        ] })
        const after = inspect(book), count = book.history_state().undoCount
        restored.restore_persistence_v1(JSON.parse(JSON.stringify(book.snapshot_persistence_v1())))
        const persisted = inspect(restored)
        book.history_apply('undo')
        const undone = inspect(book), undoCount = book.history_state().undoCount
        book.history_apply('redo')
        return { before, after, persisted, undone, redone: inspect(book),
          count, undoCount, affected }
      } finally { restored.free(); book.free() }
    }, { url: `${wasmBase}${variant}/einfach_wasm.js`, mode })
    expect(result.count).toBe(1)
    expect(result.undoCount).toBe(0)
    expect(result.after.first).toBe(mode === 'formats' ? '7' : '')
    expect(result.after.formula).toBe(mode === 'formats' ? '=A1*2' : '')
    expect(result.after.gap).toBe('gap')
    expect(result.after.styles.find((style: { addr: string }) => style.addr === 'A1').format.bold)
      .toBe(mode === 'contents')
    expect(result.after.styles.find((style: { addr: string }) => style.addr === 'B1'))
      .toEqual(result.before.styles.find((style: { addr: string }) => style.addr === 'B1'))
    expect(result.persisted).toEqual(result.after)
    expect(result.undone).toEqual(result.before)
    expect(result.redone).toEqual(result.after)
    expect(result.affected).toEqual({ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 2 })
  })
}

for (const variant of ['lite', 'full']) test(`${variant} rejects capacity before any write and clears huge contents sparsely`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const wasm = await import(url)
    await wasm.default()
    const book = new wasm.WasmWorkbook()
    try {
      book.set_cell_input(0, 'A1', '7')
      book.set_cell_input(0, 'XFD1048576', '=2+3')
      book.history_clear('')
      const all = { rowStart: 0, rowEnd: 1048575, colStart: 0, colEnd: 16383, scope: 'cell' }
      let error = ''
      try {
        book.clear_selection({ sheet: 0, mode: 'all', targets: [
          { ...all, rowEnd: 0, colEnd: 0 }, all,
        ] })
      } catch (cause) { error = String(cause) }
      const kept = book.getCellDisplay(0, 'A1'), rejectedHistory = book.history_state().undoCount
      book.clear_selection({ sheet: 0, mode: 'contents', targets: [all] })
      const cleared = book.getCellDisplay(0, 'XFD1048576'), count = book.history_state().undoCount
      book.history_apply('undo')
      return { error, kept, rejectedHistory, cleared, count,
        restored: book.snapshotCell(0, 'XFD1048576').formula }
    } finally { book.free() }
  }, `${wasmBase}${variant}/einfach_wasm.js`)
  expect(result.error).toContain('100,000')
  expect(result.kept).toBe('7')
  expect(result.rejectedHistory).toBe(0)
  expect(result.cleared).toBe('')
  expect(result.count).toBe(1)
  expect(result.restored).toBe('=2+3')
})
