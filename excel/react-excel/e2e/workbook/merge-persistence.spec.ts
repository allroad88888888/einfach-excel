import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`

// 验证真实 WASM 的 JS 序列化边界；不声称当前页面已有保存/打开菜单。
for (const variant of ['lite', 'full']) {
  test(`${variant} native seed import rejects covered content before writing any cells`, async ({
    page,
  }) => {
    await page.goto('/')
    const result = await page.evaluate(async (url) => {
      const module = await import(url)
      await module.default()
      const workbook = new module.WasmWorkbook()
      try {
        workbook.merge_cells(0, 0, 0, 1, 1, 'merge', false)
        workbook.bulk_import_cells([{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Anchor' }])
        const before = workbook.snapshot_persistence_v1()
        let rejection = ''
        try {
          workbook.bulk_import_cells([
            { sheet: 0, row: 0, col: 0, kind: 'text', value: 'Changed' },
            { sheet: 0, row: 1, col: 1, kind: 'text', value: 'Hidden' },
          ])
        } catch (error) {
          rejection = String(error)
        }
        return { rejection, before, after: workbook.snapshot_persistence_v1() }
      } finally {
        workbook.free()
      }
    }, `${wasmUrl}${variant}/einfach_wasm.js`)
    expect(result.rejection).toContain('covered cells')
    expect(result.after).toEqual(result.before)
  })

  test(`${variant} WASM persistence retains merges and rejects invalid geometry atomically`, async ({
    page,
  }) => {
    await page.goto('/')
    const result = await page.evaluate(async (url) => {
      const module = await import(url)
      await module.default()
      const source = new module.WasmWorkbook()
      const restored = new module.WasmWorkbook()
      try {
        source.set_formula(0, 'A1', '=1/4')
        source.merge_cells(0, 0, 0, 1, 2, 'center', false)
        const snapshot = source.snapshot_persistence_v1()
        // JSON 编解码模拟实际保存，不把 WASM 对象指针当作持久化。
        restored.restore_persistence_v1(JSON.parse(JSON.stringify(snapshot)))
        const ranges = Array.from(restored.merged_ranges(0))
        const input = restored.get_formula(0, 'A1')
        const number = restored.get_number(0, 'A1')
        const restoredSnapshot = restored.snapshot_persistence_v1()
        const bad = JSON.parse(JSON.stringify(restoredSnapshot))
        bad.merges[0].ranges.push([1, 1, 2, 2])
        let rejection = ''
        try {
          restored.restore_persistence_v1(bad)
        } catch (error) {
          rejection = String(error)
        }
        const afterRejection = restored.snapshot_persistence_v1()
        const oldUndo = restored.history_apply('undo')
        restored.merge_cells(0, 0, 0, 1, 2, 'unmerge', false)
        const unmerged = Array.from(restored.merged_ranges(0))
        restored.history_apply('undo')
        return {
          merges: snapshot.merges,
          ranges,
          input,
          number,
          rejection,
          restoredSnapshot,
          afterRejection,
          oldUndo,
          unmerged,
          undoRanges: Array.from(restored.merged_ranges(0)),
        }
      } finally {
        source.free()
        restored.free()
      }
    }, `${wasmUrl}${variant}/einfach_wasm.js`)
    expect(result.merges).toEqual([{ sheet: 0, ranges: [[0, 0, 1, 2]] }])
    expect(result.ranges).toEqual([0, 0, 1, 2])
    expect(result.input).toBe('=1/4')
    expect(result.number).toBe(0.25)
    expect(result.rejection).toContain('overlap')
    expect(result.afterRejection).toEqual(result.restoredSnapshot)
    expect(result.oldUndo).toBe(false)
    expect(result.unmerged).toEqual([])
    expect(result.undoRanges).toEqual(result.ranges)
  })
}
