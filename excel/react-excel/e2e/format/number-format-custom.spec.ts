import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
const preview = (page: Page) => page.getByRole('status', { name: 'Number format preview' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Number format', exact: true })
const code = (page: Page) => page.getByRole('textbox', { name: 'Format code', exact: true })

async function input(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await formula(page).fill(value)
  await formula(page).press('Enter')
  await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
}
async function openCustom(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await showRibbonItem(page, 'format.number-format-settings')
  await button(page, 'Number format settings').click()
  await page.getByLabel('Number format category').selectOption('custom')
  await code(page).fill(value)
}
async function apply(page: Page) {
  await button(page, 'Apply number format').click()
  await expect(dialog(page)).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('custom code sections color negatives, keep the raw value and undo as one step', async ({ page }) => {
  await input(page, 'E40', '39:4', '-1234.5')
  await input(page, 'E41', '40:4', '1234.5')
  await expect(cell(page, '39:4')).toHaveText('-1234.5')
  await openCustom(page, 'E40', '39:4', '#,##0.00;[Red](#,##0.00)')
  await expect(preview(page)).toHaveText('(1,234.50)')
  await expect(preview(page)).toHaveCSS('color', 'rgb(255, 0, 0)')
  await expect(cell(page, '39:4')).toHaveText('-1234.5')
  await apply(page)
  await expect(cell(page, '39:4')).toHaveText('(1,234.50)')
  await expect(cell(page, '39:4')).toHaveCSS('color', 'rgb(255, 0, 0)')
  await expect(formula(page)).toHaveValue('-1234.5')
  await expect(cell(page, '40:4')).toHaveText('1234.5')
  await expect(cell(page, '40:4')).not.toHaveCSS('color', 'rgb(255, 0, 0)')

  await showRibbonItem(page, 'format.number-format-settings')
  await button(page, 'Number format settings').click()
  await expect(page.getByLabel('Number format category')).toHaveValue('custom')
  await expect(code(page)).toHaveValue('#,##0.00;[Red](#,##0.00)')
  await page.keyboard.press('Escape')

  await button(page, 'Undo').click()
  await expect(cell(page, '39:4')).toHaveText('-1234.5')
  await expect(cell(page, '39:4')).not.toHaveCSS('color', 'rgb(255, 0, 0)')
  await button(page, 'Redo').click()
  await expect(cell(page, '39:4')).toHaveText('(1,234.50)')
  await expect(cell(page, '39:4')).toHaveCSS('color', 'rgb(255, 0, 0)')
  await expect(cell(page, '40:4')).toHaveText('1234.5')
})

test('custom literals sit between digits and fill pushes the symbol and number to the edges', async ({ page }) => {
  await input(page, 'E42', '41:4', '123456789')
  await openCustom(page, 'E42', '41:4', '000-00-0000')
  await expect(preview(page)).toHaveText('123-45-6789')
  await apply(page)
  await expect(cell(page, '41:4')).toHaveText('123-45-6789')
  await expect(formula(page)).toHaveValue('123456789')

  await input(page, 'E43', '42:4', '1234.5')
  await openCustom(page, 'E43', '42:4', '_($* #,##0.00_)')
  await apply(page)
  const target = cell(page, '42:4')
  // `_(`/`_)` 的占位括号不可见，只留宽度。
  await expect(target.locator('.cell-fill-start')).toHaveText('$', { useInnerText: true })
  await expect(target.locator('.cell-fill-end')).toHaveText('1,234.50', { useInnerText: true })
  await expect(target.locator('.cell-pad')).toHaveText(['(', ')'])
  const box = (await target.boundingBox())!
  const start = (await target.locator('.cell-fill-start').boundingBox())!
  const end = (await target.locator('.cell-fill-end').boundingBox())!
  // `$` 贴单元格左内边距，数字贴右内边距，中间是填充出的空白。
  expect(start.x - box.x).toBeLessThanOrEqual(10)
  expect(box.x + box.width - (end.x + end.width)).toBeLessThanOrEqual(10)
  expect(end.x - (start.x + start.width)).toBeGreaterThan(20)
  await expect(cell(page, '43:4')).not.toHaveText('$1,234.50')
  await button(page, 'Undo').click()
  await expect(target).toHaveText('1234.5')
  await expect(target.locator('.cell-fill-text')).toHaveCount(0)
})

test('invalid custom codes stay in the draft until corrected and then apply once', async ({ page }) => {
  await input(page, 'E44', '43:4', '2.25')
  const neighbor = await cell(page, '44:4').textContent()
  await openCustom(page, 'E44', '43:4', '0.0.0')
  await expect(dialog(page).getByRole('alert')).toContainText('only one decimal point')
  await expect(code(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(button(page, 'Apply number format')).toBeDisabled()
  await code(page).press('Enter')
  await expect(dialog(page)).toBeVisible()
  await expect(cell(page, '43:4')).toHaveText('2.25')
  await code(page).fill('0.0')
  await expect(dialog(page).getByRole('alert')).toHaveCount(0)
  await expect(preview(page)).toHaveText('2.3')
  await apply(page)
  await expect(cell(page, '43:4')).toHaveText('2.3')
  await expect(cell(page, '44:4')).toHaveText(neighbor!)
  await button(page, 'Undo').click()
  await expect(cell(page, '43:4')).toHaveText('2.25')
  await button(page, 'Redo').click()
  await expect(cell(page, '43:4')).toHaveText('2.3')
})

test('underscore padding reserves the width of the named character', async ({ page }) => {
  await input(page, 'E46', '45:4', '7')
  await openCustom(page, 'E46', '45:4', '_W0')
  await apply(page)
  const target = cell(page, '45:4')
  await expect(target).toHaveText('7', { useInnerText: true })
  const pad = target.locator('.cell-pad')
  await expect(pad).toHaveText('W')
  await expect(pad).toHaveCSS('visibility', 'hidden')
  const { reserved, expected } = await pad.evaluate((node) => {
    const context = document.createElement('canvas').getContext('2d')!
    context.font = getComputedStyle(node).font
    return { reserved: node.getBoundingClientRect().width, expected: context.measureText('W').width }
  })
  expect(reserved).toBeCloseTo(expected, 0)
})

test('custom fraction placeholders show the integer and the nearest fraction', async ({ page }) => {
  await input(page, 'E47', '46:4', '5.25')
  await openCustom(page, 'E47', '46:4', '# ?/?')
  await expect(preview(page)).toHaveText('5 1/4')
  await apply(page)
  await expect(cell(page, '46:4')).toHaveText('5 1/4')
  await expect(formula(page)).toHaveValue('5.25')
  await openCustom(page, 'E47', '46:4', '# ?/8')
  await expect(preview(page)).toHaveText('5 2/8')
})

test('preview lays out the repeated fill exactly as the grid does', async ({ page }) => {
  await input(page, 'E48', '47:4', '7')
  await openCustom(page, 'E48', '47:4', '0*-')
  const previewFill = preview(page).locator('.cell-fill-repeat')
  await expect(previewFill).toContainText('-')
  expect((await previewFill.boundingBox())!.width).toBeGreaterThan(20)
  expect(await preview(page).innerText()).toContain('-')
  await apply(page)
  const gridFill = cell(page, '47:4').locator('.cell-fill-repeat')
  await expect(gridFill).toContainText('-')
  expect((await gridFill.boundingBox())!.width).toBeGreaterThan(20)
})
