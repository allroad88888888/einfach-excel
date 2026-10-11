import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function input(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  const bar = page.getByRole('textbox', { name: 'Active cell value' })
  await bar.fill(value); await bar.press('Enter')
  await expect(bar).toBeEnabled()
}
async function toggle(page: Page, enabled: boolean) {
  await button(page, 'Tables').click()
  await button(page, 'Edit table Orders').click()
  const headers = page.getByLabel('Header row', { exact: true })
  await headers.click()
  await expect(headers).toBeChecked({ checked: enabled })
  await expect(headers).toBeEnabled()
  await button(page, 'Cancel').click()
}

for (const width of [1280, 390]) test(`split conditional scope remains one editable rule at ${width}px`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 800 })
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await button(page, 'New sheet').click()
  await expect(page.getByRole('tab', { name: 'Sheet3', exact: true })).toHaveAttribute('aria-selected', 'true')
  await select(page, 'B1:C3', '0:1')
  await button(page, 'Tables').click()
  await page.getByLabel('Table name', { exact: true }).fill('Orders')
  await button(page, 'Create table').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await toggle(page, false)
  for (const [address, coord, value] of [
    ['B1', '0:1', 'Occupied'], ['A5', '4:0', '0'], ['B5', '4:1', '50'],
    ['C5', '4:2', '100'], ['D5', '4:3', '1000'], ['A7', '6:0', '-999'],
  ]) await input(page, address, coord, value)
  await select(page, 'A5:D6', '4:0')
  await button(page, 'Conditional formatting').click()
  await page.getByLabel('Rule type').selectOption('color-scale')
  await page.getByLabel('Minimum color').fill('#000000')
  await page.getByLabel('Maximum color').fill('#ffffff')
  await button(page, 'Add rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '4:1')).toHaveCSS('background-color', 'rgb(13, 13, 13)')
  await toggle(page, true)
  await select(page, 'B6', '5:1')
  await expect(cell(page, '5:1')).toHaveText('50')
  await expect(cell(page, '5:1')).toHaveCSS('background-color', 'rgb(13, 13, 13)')
  await button(page, 'Conditional formatting').click()
  const dialog = page.getByRole('dialog', { name: 'Conditional formatting', exact: true })
  await expect(dialog.getByRole('listitem')).toHaveCount(1)
  await button(page, 'Edit rule 1').click()
  await expect(page.getByLabel('Applies to', { exact: true })).toHaveValue('A5:A6, B6:C7, D5:D6')
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath(`conditional-regions-${width}.png`), fullPage: true })
  await button(page, 'Cancel').click()
  await button(page, 'Undo').click()
  await select(page, 'B5', '4:1')
  await expect(cell(page, '4:1')).toHaveText('50')
  await expect(cell(page, '4:1')).toHaveCSS('background-color', 'rgb(13, 13, 13)')
  await button(page, 'Redo').click()
  await button(page, 'Conditional formatting').click()
  await button(page, 'Edit rule 1').click()
  await page.getByLabel('Maximum color').fill('#ff0000')
  await button(page, 'Save rule').click()
  await expect(dialog).toHaveCount(0)
  await select(page, 'B6', '5:1')
  await expect(cell(page, '5:1')).toHaveCSS('background-color', 'rgb(13, 0, 0)')
  await input(page, 'D5', '4:3', '100')
  await select(page, 'B6', '5:1')
  await expect(cell(page, '5:1')).toHaveCSS('background-color', 'rgb(128, 0, 0)')
  await select(page, 'A7', '6:0')
  await expect(cell(page, '6:0')).not.toHaveCSS('background-color', 'rgb(0, 0, 0)')
  expect(errors).toEqual([])
})

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} restores multi-area scope and rejects invalid extra bounds`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const source = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      for (const [address, value] of [['A1', '0'], ['A2', '50'], ['C1', '100'], ['C2', '200'], ['B1', '-999']])
        source.set_cell_input(0, address, value)
      const scope = { range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 0 },
        additionalRanges: [{ rowStart: 0, rowEnd: 1, colStart: 2, colEnd: 2 }] }
      source.setConditionalFormatRule(0, { revision: 0, ruleId: 'scale', scope,
        rule: { kind: 'color-scale', minColor: '#000000', maxColor: '#ffffff' } })
      const snapshot = JSON.parse(JSON.stringify(source.snapshot_persistence_v1()))
      restored.restore_persistence_v1(snapshot)
      const rules = restored.listConditionalFormats(0).rules
      const display = restored.snapshot_display_format_range(0, 0, 0, 1, 2)
      const before = JSON.stringify(restored.snapshot_persistence_v1())
      let rejected = false
      try {
        restored.setConditionalFormatRule(0, {
          revision: restored.listConditionalFormats(0).revision,
          ruleId: 'scale',
          scope: { ...scope, additionalRanges: [{ ...scope.range, rowEnd: 1048576 }] },
          rule: rules[0].rule })
      } catch { rejected = true }
      const unchanged = JSON.stringify(restored.snapshot_persistence_v1()) === before
      restored.set_cell_input(0, 'C2', '100')
      const changed = restored.snapshot_display_format_range(0, 1, 0, 1, 0)
      return { scope, rules, display, changed, rejected, unchanged }
    } finally { source.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result.rules).toHaveLength(1)
  expect(result.rules[0].scope).toEqual(result.scope)
  expect(result.display.cellStyles).toContainEqual({ addr: 'A2', format: { bgColor: '#404040' } })
  expect(result.display.cellStyles.some((entry: { addr: string }) => entry.addr === 'B1')).toBe(false)
  expect(result.changed.cellStyles).toEqual([{ addr: 'A2', format: { bgColor: '#808080' } }])
  expect(result.rejected && result.unchanged).toBe(true)
})
