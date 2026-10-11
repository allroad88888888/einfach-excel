import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
// 真实二进制边界验证，不将其宣称为页面已经具备保存菜单或保护面板。
for (const variant of ['lite', 'full']) test(`${variant} calculated columns restore and respect protection`,
  async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async (url) => {
      const module = await import(url)
      await module.default()
      const source = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
      try {
        for (const [address, input] of [['A1', 'Amount'], ['B1', 'Total'],
          ['A2', '1'], ['A3', '2'], ['A4', '3']]) source.set_cell_input(0, address, input)
        source.change_table(0, { kind: 'create', name: 'Sales', range: [0, 0, 3, 1] })
        source.set_cell_input(0, 'B3', '=[@Amount]*2')
        const snapshot = JSON.parse(JSON.stringify(source.snapshot_persistence_v1()))
        restored.restore_persistence_v1(snapshot)
        const values = () => ['B2', 'B3', 'B4'].map((address) => restored.get_number(0, address))
        const initial = values(), cleanHistory = !restored.history_apply('undo')
        // 保护策略允许单格写入，但不允许整列改写或自动扩大 Table。
        restored.set_cell_input_with_table_expansion(0, 'B3', '=[@Amount]*3', false)
        const protectedValues = values()
        restored.set_cell_input_with_table_expansion(0, 'A5', '4', false)
        const protectedRange = restored.listTables()[0].range
        const protectedFormula = restored.get_formula(0, 'B5')
        restored.restore_persistence_v1(snapshot)
        restored.set_cell_input(0, 'A5', '4')
        const inherited = restored.get_number(0, 'B5')
        restored.history_apply('undo')
        const undoneRange = restored.listTables()[0].range
        restored.history_apply('redo')
        const redone = restored.get_number(0, 'B5')
        restored.change_table(0, { kind: 'resize', name: 'Sales', range: [0, 0, 5, 1] })
        const resizedFormula = restored.get_formula(0, 'B6')
        restored.edit_structure(0, 'insert-rows', 2, 1)
        const insertedFormula = restored.get_formula(0, 'B3')
        const shifted = restored.get_number(0, 'B6')
        const rejected = []
        for (const formula of ['=IF(ROW()>4,SEQUENCE(2),1)',
          '=IF(ROW()>4,SEQUENCE(1,2),1)']) {
          restored.restore_persistence_v1(snapshot)
          restored.set_cell_input(0, 'B2', formula)
          restored.set_cell_input(0, 'C4', '99')
          const before = JSON.stringify(restored.snapshot_persistence_v1())
          const history = JSON.stringify(restored.history_state())
          let error = ''
          try { restored.edit_structure(0, 'insert-rows', 2, 1) }
          catch (failure) { error = String(failure) }
          rejected.push({ error, unchanged: before === JSON.stringify(restored.snapshot_persistence_v1()),
            historyUnchanged: history === JSON.stringify(restored.history_state()) })
        }
        return { initial, cleanHistory, protectedValues, protectedRange, protectedFormula,
          inherited, undoneRange, redone, resizedFormula, insertedFormula, shifted, rejected }
      } finally { source.free(); restored.free() }
    }, `${wasmUrl}${variant}/einfach_wasm.js`)
    expect(result).toMatchObject({ initial: [2, 4, 6], cleanHistory: true,
      protectedValues: [2, 6, 6], protectedRange: 'A1:B4', protectedFormula: '',
      inherited: 8, undoneRange: 'A1:B4', redone: 8, shifted: 8 })
    expect(result.resizedFormula).toMatch(/\[@Amount\].*2/)
    expect(result.insertedFormula).toMatch(/\[@Amount\].*2/)
    for (const rejected of result.rejected) {
      expect(rejected.error).toContain('Spilled arrays')
      expect(rejected.unchanged).toBe(true)
      expect(rejected.historyUnchanged).toBe(true)
    }
  })
