import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`

// 实际构件的原生大纲协议；不以此代替分组按钮与画布的 Worker E2E。
for (const variant of ['lite', 'full']) test(`${variant} outline round-trip preserves hidden sources`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const source = new module.WasmWorkbook()
    const restored = new module.WasmWorkbook()
    try {
      for (let row = 1; row <= 6; row++) source.set_number(0, `A${row}`, 1)
      source.set_formula(0, 'B1', '=SUBTOTAL(109,A1:A6)')
      source.set_formula(0, 'B2', '=SUBTOTAL(9,A1:A6)')
      source.set_visibility(0, 3, 0, 3, 0, 'hide-rows')
      source.set_visibility(0, 0, 3, 0, 3, 'hide-columns')
      source.setEvalFilterHiddenRows(0, [4])
      for (const axis of ['row', 'column']) {
        source.change_outline(0, axis, { kind: 'group', start: 1, end: 4 })
        source.change_outline(0, axis, { kind: 'group', start: 2, end: 3 })
        source.change_outline(0, axis, { kind: 'show-level', level: 1 })
      }
      const snapshot = JSON.parse(JSON.stringify(source.snapshot_persistence_v1()))
      restored.restore_persistence_v1(snapshot)
      const before = restored.sheet_visibility(0)
      const initialUndo = restored.history_apply('undo')
      const collapsedSum = restored.get_number(0, 'B1')
      restored.change_outline(0, 'row', { kind: 'set-collapsed', index: 0, collapsed: false })
      const childHidden = restored.sheet_visibility(0).outlineRows
      restored.change_outline(0, 'row', { kind: 'show-level', level: 9 })
      restored.change_outline(0, 'column', { kind: 'show-level', level: 9 })
      const expanded = restored.sheet_visibility(0)
      const expandedSum = restored.get_number(0, 'B1')
      const filteredSum = restored.get_number(0, 'B2')
      restored.history_apply('undo')
      const undoColumns = restored.sheet_visibility(0).outlineColumns
      restored.history_apply('redo')
      const redoColumns = restored.sheet_visibility(0).outlineColumns ?? []
      const stable = JSON.stringify(restored.snapshot_persistence_v1())
      const errors: string[] = []
      for (const action of [
        { kind: 'group', start: 3, end: 5 },
        { kind: 'set-collapsed', index: 99, collapsed: true },
        { kind: 'group', start: 0, end: 2, unexpected: true },
      ]) {
        try { restored.change_outline(0, 'row', action); errors.push('') }
        catch (error) { errors.push(String(error)) }
      }
      const rejectedUnchanged = stable === JSON.stringify(restored.snapshot_persistence_v1())
      return { before, initialUndo, collapsedSum, childHidden, expanded, expandedSum,
        filteredSum, undoColumns, redoColumns, errors, rejectedUnchanged }
    } finally { source.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result.initialUndo).toBe(false)
  expect(result.before).toMatchObject({ manualRows: [3], manualColumns: [3], filterRows: [4],
    outlineRows: [1, 2, 3, 4], outlineColumns: [1, 2, 3, 4] })
  expect(result.childHidden).toEqual([2, 3])
  expect(result.collapsedSum).toBe(2)
  expect(result.expandedSum).toBe(4)
  expect(result.filteredSum).toBe(5)
  expect(result.expanded).toMatchObject({ manualRows: [3], manualColumns: [3], filterRows: [4] })
  expect(result.expanded.outlineRows ?? []).toEqual([])
  expect(result.undoColumns).toEqual([1, 2, 3, 4])
  expect(result.redoColumns).toEqual([])
  expect(result.errors.every(Boolean)).toBe(true)
  expect(result.rejectedUnchanged).toBe(true)
})
