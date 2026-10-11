import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
// 导入保存逐格事实；交互写边框的邻格同步规则不能在装载期间运行。
for (const variant of ['lite', 'full']) test(`${variant} native import keeps sparse styles and adjacent borders`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook()
    try {
      const stats = book.bulk_import_cells([
        { sheet: 0, row: 0, col: 0, kind: 'text', value: 'Amount', format: { bold: true } },
        { sheet: 0, row: 1, col: 0, kind: 'number', value: 10 },
        { sheet: 0, row: 5, col: 1, kind: 'text', value: 'Double',
          format: { borders: { bottom: { style: 'double', color: '#c00000' } } } },
        { sheet: 0, row: 6, col: 1, kind: 'text', value: 'Dashed',
          format: { borders: { left: { style: 'dashed', color: '#6fa8dc' } } } },
        { sheet: 0, row: 7, col: 1, kind: 'text', value: 'Dotted',
          format: { borders: { top: { style: 'dotted', color: '#93c47d' } } } },
        { sheet: 0, row: 8, col: 1, kind: 'number', value: 'not a number', format: { bold: true } },
      ])
      const raw = book.snapshot_format_range(0, 0, 0, 8, 1)
      const cleanHistory = !book.history_apply('undo')
      book.change_table(0, { kind: 'create', name: 'Sales', range: [0, 0, 1, 0] })
      book.change_table(0, { kind: 'style', name: 'Sales',
        style: { preset: 'blue', bandedRows: true, firstColumn: false } })
      const display = book.snapshot_display_format_range(0, 0, 0, 1, 0)
      return { stats, raw, display, cleanHistory }
    } finally { book.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result.stats).toMatchObject({ accepted: 5, errors: 1 })
  expect(result.cleanHistory).toBe(true)
  expect(result.raw.cellStyles).toEqual(expect.arrayContaining([
    { addr: 'A1', format: { bold: true } },
    { addr: 'B6', format: { borders: { bottom: { style: 'double', color: '#c00000' } } } },
    { addr: 'B7', format: { borders: { left: { style: 'dashed', color: '#6fa8dc' } } } },
    { addr: 'B8', format: { borders: { top: { style: 'dotted', color: '#93c47d' } } } },
  ]))
  expect(result.raw.cellStyles.some((entry: { addr: string }) => entry.addr === 'B9')).toBe(false)
  expect(result.display.cellStyles).toEqual(expect.arrayContaining([
    { addr: 'A1', format: { bold: true, fgColor: '#ffffff', bgColor: '#1f4e78' } },
    { addr: 'A2', format: { bold: false, fgColor: '#1f2937', bgColor: '#d9e8f5' } },
  ]))
})
