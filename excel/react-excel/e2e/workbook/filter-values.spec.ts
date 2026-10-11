import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const menu = (page: Page) => page.getByRole('combobox', { name: 'Worksheet filter' })
const checkbox = (page: Page, value: string) => page.getByRole('checkbox', { name: `Select value ${value}`, exact: true })
async function open(page: Page, column = 'A') {
  await button(page, `Filter column ${column}`).click()
  await button(page, 'Choose values for condition 1').click()
  await expect(page.getByLabel('Filter values page', { exact: true })).toBeVisible()
}
async function search(page: Page, value: string) {
  const field = page.getByRole('searchbox', { name: 'Search filter values' })
  await field.fill(value); await field.press('Enter')
  await expect(page.getByLabel('Filter values page', { exact: true })).toBeVisible()
}
async function apply(page: Page) {
  await button(page, 'Apply filter').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('native pages include all 1000 seed IDs and retain choices across paging and offscreen search', async ({ page }) => {
  await select(page, 'A1:H1001', '0:0'); await menu(page).selectOption('selection')
  await open(page)
  await expect(page.getByLabel('Filter values page', { exact: true })).toHaveText('1–50 of 1000')
  await checkbox(page, 'SO-10001').check()
  await button(page, 'Next filter values page').click()
  await expect(page.getByLabel('Filter values page', { exact: true })).toHaveText('51–100 of 1000')
  await checkbox(page, 'SO-10051').check()
  await button(page, 'Previous filter values page').click()
  await expect(checkbox(page, 'SO-10001')).toBeChecked()
  await search(page, 'SO-11000')
  await expect(page.getByLabel('Filter values page', { exact: true })).toHaveText('1–1 of 1')
  await checkbox(page, 'SO-11000').check()
  await expect(page.getByLabel('Selected filter values')).toHaveText('3 selected')
  await apply(page)
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(cell(page, '51:0')).toHaveText('SO-10051')
  await expect(cell(page, '1000:0')).toHaveText('SO-11000')
  await expect(cell(page, '2:0')).toHaveCount(0)
  await expect(button(page, 'Filter column A')).toBeFocused()
  await button(page, 'Undo').click(); await expect(cell(page, '2:0')).toHaveText('SO-10002')
  await button(page, 'Redo').click(); await expect(cell(page, '1000:0')).toHaveText('SO-11000')
})

test('other column conditions narrow native candidates, while the current column can still choose another value', async ({ page }) => {
  await select(page, 'A1:H1001', '0:0'); await menu(page).selectOption('selection')
  await open(page, 'C'); await checkbox(page, 'West').check(); await apply(page)
  await open(page)
  await expect(page.getByLabel('Filter values page', { exact: true })).toHaveText('1–50 of 250')
  await search(page, 'SO-10001')
  await expect(page.getByText('No matching values. Try another search.')).toBeVisible()
  await button(page, 'Cancel').click()
  await open(page, 'C')
  await expect(checkbox(page, 'West')).toBeChecked()
  await expect(checkbox(page, 'North')).toBeVisible()
  await button(page, 'Cancel').click()
})

test('Table value choices preserve the other column condition, totals and independent table filters', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A80', '79:0')
  await button(page, 'Filter DemoTable column A').click()
  await button(page, 'Choose values for condition 1').click()
  await expect(page.getByLabel('Filter values page', { exact: true })).toHaveText('1–3 of 3')
  await checkbox(page, 'Mouse').check(); await apply(page)
  await expect(cell(page, '80:0')).toHaveCount(0)
  await expect(cell(page, '81:0')).toHaveText('Mouse')
  await expect(cell(page, '82:0')).toHaveCount(0)
  await expect(cell(page, '83:1')).toHaveText('20')
  await button(page, 'Filter DemoTable column B').click()
  await expect(page.getByLabel('Minimum 1', { exact: true })).toHaveValue('0')
  await button(page, 'Choose values for condition 1').click()
  await expect(page.getByLabel('Filter values page', { exact: true })).toHaveText('1–1 of 1')
  await expect(checkbox(page, '20')).toBeVisible()
  await button(page, 'Cancel').click()
  await select(page, 'A46', '45:0')
  await expect(button(page, 'Filter CalculatedOrders column A')).toHaveAttribute('data-filtered', 'true')
})

test('blank and multiline values stay exact through selection, re-open and native undo', async ({ page }) => {
  await button(page, 'New sheet').click()
  for (const [address, coord, value] of [
    ['A1', '0:0', 'Value'], ['A2', '1:0', '="two"&CHAR(10)&"lines"'], ['A4', '3:0', 'Other'],
  ]) {
    await select(page, address, coord)
    const input = page.getByRole('textbox', { name: 'Active cell value' })
    await input.fill(value); await input.press('Enter')
  }
  await select(page, 'A1:A4', '0:0'); await menu(page).selectOption('selection')
  await open(page)
  await checkbox(page, '(Blanks)').check()
  await page.getByRole('checkbox', { name: /Select value two\s+lines/ }).check()
  await apply(page)
  await expect(cell(page, '1:0')).toHaveText('two\nlines')
  await expect(cell(page, '2:0')).toBeVisible()
  await expect(cell(page, '3:0')).toHaveCount(0)
  await open(page)
  await expect(checkbox(page, '(Blanks)')).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Select value two\s+lines/ })).toBeChecked()
  await button(page, 'Cancel').click()
  await button(page, 'Undo').click(); await expect(cell(page, '3:0')).toHaveText('Other')
})

for (const width of [1280, 390]) test(`values picker supports keyboard search and fits ${width}px without writing on cancel`,
  async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await select(page, 'A1:H1001', '0:0'); await menu(page).selectOption('selection')
    await open(page)
    await search(page, 'SO-11000')
    const target = checkbox(page, 'SO-11000')
    await target.focus(); await target.press('Space'); await expect(target).toBeChecked()
    const dialog = page.getByRole('dialog')
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(button(page, 'Apply filter')).toBeInViewport()
    await page.screenshot({ path: `/tmp/excel-filter-values-${width}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(button(page, 'Filter column A')).toBeFocused()
    // 只撤销最初的区域设置：浏览、搜索和勾选草稿没有增加历史。
    await button(page, 'Undo').click()
    await expect(button(page, 'Filter column A')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    expect(errors).toEqual([])
  })
