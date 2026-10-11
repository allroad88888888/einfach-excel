import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
// 验证实际 JS/WASM 持久化边界；不宣称页面已具备保存／打开菜单。
for (const variant of ['lite', 'full']) test(`${variant} validation round-trip retains all rules`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const source = new module.WasmWorkbook()
    const restored = new module.WasmWorkbook()
    try {
      const rules = [
        { kind: 'whole-number', min: 1, max: 10, ignoreBlank: true },
        { kind: 'decimal', min: 0, max: 1, ignoreBlank: false },
        { kind: 'list', items: ['Ready', '001', '=1+2'], ignoreBlank: true },
        { kind: 'date', min: '2026-10-01', max: '2026-10-31', ignoreBlank: true },
        { kind: 'time', min: '09:00', max: '17:00', ignoreBlank: true },
        { kind: 'text-length', min: 2, max: 4, ignoreBlank: false },
        { kind: 'whole-number', min: 5, max: 5, operator: 'equal', ignoreBlank: true },
        { kind: 'date', min: '2026-10-01', max: '2026-10-01', operator: 'greater-than', ignoreBlank: true },
        { kind: 'time', min: '09:00', max: '17:00', operator: 'not-between', ignoreBlank: true },
        { kind: 'text-length', min: 4, max: 4, operator: 'less-than', ignoreBlank: true },
      ]
      rules.forEach((rule, col) => source.setDataValidation(0, 0, col, 2, col, rule))
      source.set_cell_input(0, 'A1', '5')
      source.set_cell_input(0, 'B1', '0.5')
      source.set_cell_input(0, 'C1', "'001")
      source.set_cell_input(0, 'D1', '2026-10-11')
      source.set_cell_input(0, 'E1', '12:00')
      source.set_cell_input(0, 'F1', '中文🙂')
      source.set_cell_input(0, 'G1', '5')
      source.set_cell_input(0, 'H1', '2026-10-11')
      source.set_cell_input(0, 'I1', '18:00')
      source.set_cell_input(0, 'J1', 'abc')
      const snapshot = JSON.parse(JSON.stringify(source.snapshot_persistence_v1()))
      restored.restore_persistence_v1(snapshot)
      const before = restored.snapshot_persistence_v1()
      const rejections = ['2.5', '=2', 'invalid', '2026-11-01', '18:00', 'x',
        '6', '2026-10-01', '12:00', 'four'].map((input, col) => {
        try { restored.set_cell_input(0, `${String.fromCharCode(65 + col)}1`, input); return '' }
        catch (error) { return String(error) }
      })
      return { rules, actual: rules.map((_, col) => restored.getDataValidation(0, 0, col)),
        before, after: restored.snapshot_persistence_v1(), rejections,
        undo: restored.history_apply('undo') }
    } finally { source.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result.actual).toEqual(result.rules)
  expect(result.rejections.every(Boolean)).toBe(true)
  expect(result.after).toEqual(result.before)
  expect(result.undo).toBe(false)
})
