import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
// 保存恢复是实际 WASM 文件边界验证；页面保存／打开菜单不在这三个功能内。
for (const variant of ['lite', 'full']) test(`${variant} names remain dynamic after JSON restore`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const source = new module.WasmWorkbook()
    const restored = new module.WasmWorkbook()
    try {
      source.add_sheet('Source')
      source.set_cell_input(1, 'A1', '10')
      source.set_cell_input(1, 'A2', '20')
      source.change_named_range(0, { kind: 'create', name: '销售额',
        target: { sheet: 1, range: [0, 0, 1, 0] } })
      source.set_cell_input(0, 'A1', '=SUM(销售额)')
      source.set_cell_input(0, 'C1', '=销售额')
      const snapshot = JSON.parse(JSON.stringify(source.snapshot_persistence_v1()))
      restored.restore_persistence_v1(snapshot)
      const initial = [restored.get_number(0, 'A1'), restored.get_number(0, 'C2')]
      const emptyHistory = restored.history_apply('undo')
      restored.set_cell_input(1, 'A2', '40')
      const changed = [restored.get_number(0, 'A1'), restored.get_number(0, 'C2')]
      restored.change_named_range(0, { kind: 'update', name: '销售额', newName: 'Revenue' })
      const before = JSON.stringify(restored.snapshot_persistence_v1())
      let invalid = ''
      try {
        const malformed = JSON.parse(before)
        malformed.namedRanges[0].target.sheet = 99
        restored.restore_persistence_v1(malformed)
      } catch (error) { invalid = String(error) }
      const unchanged = before === JSON.stringify(restored.snapshot_persistence_v1())
      const undo = restored.history_apply('undo')
      return { initial, emptyHistory, changed, invalid, unchanged, undo,
        names: restored.list_named_ranges(), total: restored.get_number(0, 'A1') }
    } finally { source.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result.initial).toEqual([30, 20])
  expect(result.emptyHistory).toBe(false)
  expect(result.changed).toEqual([50, 40])
  expect(result.invalid).not.toBe('')
  expect(result.unchanged).toBe(true)
  expect(result.undo).toBe(true)
  expect(result.names).toEqual([{ name: '销售额', target: { sheet: 1, range: [0, 0, 1, 0] } }])
  expect(result.total).toBe(50)
})
