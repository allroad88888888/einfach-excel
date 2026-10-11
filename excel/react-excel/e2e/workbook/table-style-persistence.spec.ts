import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
// 验证真实 WASM 的 JSON 保存边界，不把它当作页面保存菜单已实现的证据。
for (const variant of ['lite', 'full']) test(`${variant} table style survives save, grow, convert and undo`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const source = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      source.set_cell_input(0, 'A1', 'Amount'); source.set_cell_input(0, 'A2', '10')
      source.change_table(0, { kind: 'create', name: 'Sales', range: [0, 0, 1, 0] })
      const style = { preset: 'green', bandedRows: true, firstColumn: true }
      source.change_table(0, { kind: 'style', name: 'Sales', style })
      source.set_cell_input(0, 'D1', '=SUM(Sales[Amount])')
      const snapshot = JSON.parse(JSON.stringify(source.snapshot_persistence_v1()))
      restored.restore_persistence_v1(snapshot)
      const restoredStyle = restored.listTables()[0].style
      const cleanHistory = !restored.history_apply('undo')
      // 旧的三参 API 与新增的受保护输入入口都在真实 wasm 中执行。
      restored.set_cell_input_with_table_expansion(0, 'B2', '7', false)
      const protectedRange = restored.listTables()[0].range
      restored.set_cell_input(0, 'A3', '20')
      const grown = restored.listTables()[0]
      const visual = () => JSON.stringify(restored.snapshot_display_format_range(0, 0, 0, 2, 0))
      const before = visual()
      restored.change_table(0, { kind: 'convert-to-range', name: 'Sales' })
      const preserved = before === visual()
      const total = restored.get_number(0, 'D1')
      restored.history_apply('undo')
      const undone = restored.listTables()[0]
      const unchanged = JSON.stringify(restored.snapshot_persistence_v1())
      let rejected = false
      try {
        const invalid = JSON.parse(unchanged)
        invalid.tables[0].style.preset = 'unsupported'
        restored.restore_persistence_v1(invalid)
      } catch { rejected = true }
      return { restoredStyle, cleanHistory, protectedRange, grown, preserved, total, undone,
        rejected, unchanged: unchanged === JSON.stringify(restored.snapshot_persistence_v1()) }
    } finally { source.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  const style = { preset: 'green', bandedRows: true, firstColumn: true }
  expect(result.restoredStyle).toEqual(style)
  expect(result.cleanHistory).toBe(true)
  expect(result.protectedRange).toBe('A1:A2')
  expect(result.grown).toMatchObject({ range: 'A1:A3', style })
  expect(result.preserved).toBe(true)
  expect(result.total).toBe(30)
  expect(result.undone).toMatchObject({ range: 'A1:A3', style })
  expect(result.rejected).toBe(true)
  expect(result.unchanged).toBe(true)
})
