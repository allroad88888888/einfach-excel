import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} native text/duplicate/Stop rules survive save and restore`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url); await module.default()
    const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      book.set_text(0, 'A1', 'Cedar'); book.set_text(0, 'A2', 'cedar')
      book.set_text(0, 'A3', 'Birch'); book.set_formula(0, 'A4', '=A1')
      const scope = { range: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 0 } }
      const rules = [
        { kind: 'duplicate-values', mode: 'unique', stopIfTrue: true, format: { bgColor: '#00ff00' } },
        { kind: 'text', condition: 'contains', text: 'cedar', stopIfTrue: true, format: { bold: true } },
        { kind: 'duplicate-values', mode: 'duplicate', format: { italic: true } },
      ]
      for (const [index, rule] of rules.entries())
        book.setConditionalFormatRule(0, { revision: index, priority: index, scope, rule })
      const read = (target: typeof book) => target.snapshot_display_format_range(0, 0, 0, 4, 0)
      const display = read(book)
      const snapshot = JSON.parse(JSON.stringify(book.snapshot_persistence_v1()))
      book.history_apply('undo'); const undoneRules = book.listConditionalFormats(0).rules.length
      book.history_apply('redo'); const redone = read(book)
      restored.restore_persistence_v1(snapshot)
      const loaded = read(restored), cleanHistory = !restored.history_apply('undo')
      restored.set_text(0, 'A2', 'Birch'); const changed = read(restored)
      const before = JSON.stringify(restored.snapshot_persistence_v1())
      let rejected = false
      try {
        restored.setConditionalFormatRule(0, { revision: 3, priority: 0, scope,
          rule: { ...rules[0], stopIfTrue: 'true' } })
      } catch { rejected = true }
      return { display, undoneRules, redone, loaded, changed, rejected, cleanHistory,
        unchanged: before === JSON.stringify(restored.snapshot_persistence_v1()),
        base: snapshot.formats }
    } finally { book.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result.display).toEqual(result.redone)
  expect(result.undoneRules).toBe(2)
  expect(result.cleanHistory).toBe(true)
  expect(result.loaded).toEqual(result.display)
  expect(result.changed).not.toEqual(result.loaded)
  expect(result.rejected).toBe(true)
  expect(result.unchanged).toBe(true)
  expect(result.display.cellStyles.find((entry: { addr: string }) => entry.addr === 'A1').format)
    .toMatchObject({ bold: true })
  expect(result.display.cellStyles.find((entry: { addr: string }) => entry.addr === 'A1').format)
    .not.toHaveProperty('italic')
  expect(result.display.cellStyles.find((entry: { addr: string }) => entry.addr === 'A3').format)
    .toMatchObject({ bgColor: '#00ff00' })
  for (const format of result.base) expect(format.cellStyles).toEqual([])
})
