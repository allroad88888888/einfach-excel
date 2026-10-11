import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
// 真实构件验证排序结果保存恢复；不宣称面板选项或页面打开/保存菜单已持久化。
for (const variant of ['lite', 'full']) test(`${variant} sort options preserve native history and saved record order`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const source = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      source.set_text(0, 'A1', 'cedar'); source.set_text(0, 'A2', 'Birch')
      source.set_text(0, 'A3', 'CEDAR')
      for (let row = 1; row <= 4; row++) source.set_number(0, `B${row}`, row)
      const read = (book: typeof source) => [1, 2, 3, 4].map((row) => book.get_number(0, `B${row}`))
      const key = { col: 0, direction: 'asc', caseSensitive: true, emptyFirst: true }
      source.history_begin(0, 0, 0, 3, 1, 'Sort selection', true)
      const sorted = source.sortRange(0, { range: 'A1:B4', keys: [key] })
      source.history_finish(true)
      const order = read(source)
      source.history_apply('undo'); const undone = read(source)
      source.history_apply('redo'); const redone = read(source)
      const snapshot = JSON.parse(JSON.stringify(source.snapshot_persistence_v1()))
      const rejected = source.sortRange(0, { range: 'A1:B4', keys: [{ ...key, emptyFirst: 'true' }] })
      const unchanged = JSON.stringify(source.snapshot_persistence_v1()) ===
        JSON.stringify(snapshot)
      restored.restore_persistence_v1(snapshot)
      return { sorted, order, undone, redone, rejected, unchanged, restored: read(restored),
        cleanHistory: !restored.history_apply('undo') }
    } finally { source.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result.sorted.ok).toBe(true)
  expect(result.order).toEqual([4, 2, 3, 1])
  expect(result.undone).toEqual([1, 2, 3, 4])
  expect(result.redone).toEqual(result.order)
  expect(result.restored).toEqual(result.order)
  expect(result.rejected).toMatchObject({ ok: false, code: 'invalid-payload' })
  expect(result.unchanged).toBe(true)
  expect(result.cleanHistory).toBe(true)
})
