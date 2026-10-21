import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`

// Supplemental boundary checks complement the React -> Worker primary action tests.
for (const variant of ['lite', 'full'])
  test(`${variant} raw WASM writes and history cannot bypass current native protection`, async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async (url) => {
      const module = await import(url)
      await module.default()
      const book = new module.WasmWorkbook()
      const restored = new module.WasmWorkbook()
      try {
        book.set_cell_input(0, 'A1', '7')
        book.change_protection(0, { action: 'allow-range', range: {
          rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1,
        } })
        book.change_protection(0, { action: 'protect' })
        const before = book.snapshot_persistence_v1()
        book.set_cell_number(0, 'A1', 99)
        book.set_cell_text(0, 'A1', 'blocked')
        book.set_cell_boolean(0, 'A1', true)
        book.set_cell_error(0, 'A1', '#VALUE!')
        book.clearCellAt(0, 'A1')
        const formula = book.setFormulaAt(0, 'A1', '=99')
        let inputError = '', historyError = ''
        try { book.set_cell_input(0, 'A1', '100') } catch (error) { inputError = String(error) }
        try { book.history_apply('undo') } catch (error) { historyError = String(error) }
        const afterBlocked = book.snapshot_persistence_v1()
        const undoCount = book.history_state().undoCount
        restored.restore_persistence_v1(JSON.parse(JSON.stringify(before)))
        restored.set_cell_input(0, 'B2', '=2+3')
        const allowed = restored.snapshotCell(0, 'B2')
        return { formula, inputError, historyError, before, afterBlocked, undoCount, allowed,
          protection: restored.read_protection(0), locked: restored.snapshotCell(0, 'A1') }
      } finally { book.free(); restored.free() }
    }, `${wasmUrl}${variant}/einfach_wasm.js`)
    expect(result.formula).toBe(false)
    expect(result.inputError).toContain('protected')
    expect(result.historyError).toContain('protected')
    expect(result.afterBlocked).toEqual(result.before)
    expect(result.undoCount).toBe(1)
    expect(result.protection.mode).toBe('protected')
    expect(result.locked.display).toBe('7')
    expect(result.allowed.display).toBe('5')
  })
