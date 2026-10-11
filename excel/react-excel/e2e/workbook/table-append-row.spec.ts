import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function open(page: Page, name = 'DemoTable') {
  await button(page, 'Tables').click()
  await button(page, `Edit table ${name}`).click()
}
async function close(page: Page) {
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '4:1')).toHaveText('60')
})

test('adding a data row moves the totals and undo restores the original table', async ({ page }) => {
  await select(page, 'B84', '83:1')
  await expect(cell(page, '83:1')).toHaveText('60')
  await open(page)
  await button(page, 'Add data row').click()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B85')
  await close(page)
  await expect(cell(page, '83:1')).toHaveText('')
  await expect(cell(page, '84:1')).toHaveText('60')
  await select(page, 'B84', '83:1')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('40'); await input.press('Enter')
  await expect(cell(page, '84:1')).toHaveText('100')
  await button(page, 'Undo').click()
  await expect(cell(page, '84:1')).toHaveText('60')
  await button(page, 'Undo').click()
  await expect(cell(page, '83:1')).toHaveText('60')
  await expect(cell(page, '84:1')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '83:1')).toHaveText('')
  await expect(cell(page, '84:1')).toHaveText('60')
})

test('new seed table records inherit calculated formulas with one undo', async ({ page }) => {
  await select(page, 'C50', '49:2')
  await open(page, 'CalculatedOrders')
  await button(page, 'Add data row').click()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A46:C50')
  await close(page)
  await expect(cell(page, '49:2')).toHaveText('0')
  await select(page, 'C50', '49:2')
  await expect(page.getByRole('textbox', { name: 'Active cell value' }))
    .toHaveValue(/\[@Quantity\].*\[@Price\]/)
  await button(page, 'Undo').click()
  await expect(cell(page, '49:2')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
})

for (const width of [1280, 390]) test(`append control fits ${width}px and retains keyboard focus`,
  async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await open(page)
    const add = button(page, 'Add data row')
    await add.focus(); await add.press('Enter')
    await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B85')
    await expect(add).toBeFocused()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: `/tmp/excel-table-append-${width}.png`, fullPage: true })
    await close(page)
    await expect(button(page, 'Tables')).toBeFocused()
  })
