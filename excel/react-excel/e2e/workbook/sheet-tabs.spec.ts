import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

async function switchSheet(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('td[data-cell="0:0"]')).toBeVisible()
}

async function rename(page: Page, name: string) {
  await page.getByRole('button', { name: 'Rename sheet' }).click()
  const input = page.getByRole('textbox', { name: 'Sheet name' })
  await input.fill(name)
  await input.press('Enter')
  await expect(input).toBeHidden()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
}

test('seed summary reads the same Rust workbook and sheet switching keeps values isolated', async ({
  page,
}) => {
  await switchSheet(page, 'Summary')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('First order total')
  await expect(page.locator('td[data-cell="0:1"]')).toHaveText('79')
  await expect(page.locator('td[data-cell="1:1"]')).toHaveText('Acme Co.')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveCSS('font-weight', '700')
  await switchSheet(page, 'Sales Orders')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

test('new sheet is blank, editable and uses the existing Worker', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('42')
  await formula.press('Enter')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('42')
  await switchSheet(page, 'Sales Orders')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('Order')
  await switchSheet(page, 'Sheet3')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('42')
  expect(workers).toEqual([])
})

test('rename retargets cross-sheet formulas and later source edits still recalculate', async ({
  page,
}) => {
  await rename(page, "O'Brien Orders")
  await switchSheet(page, 'Summary')
  await expect(page.locator('td[data-cell="0:1"]')).toHaveText('79')
  await select(page, 'B1', '0:1')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(
    "='O''Brien Orders'!G2",
  )
  await switchSheet(page, "O'Brien Orders")
  await select(page, 'E2', '1:4')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('2')
  await formula.press('Enter')
  await expect(page.locator('td[data-cell="1:4"]')).toHaveText('2')
  await switchSheet(page, 'Summary')
  await expect(page.locator('td[data-cell="0:1"]')).toHaveText('158')
})

test('duplicate, invalid and reserved names leave the old tab intact and allow retry', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Sales Orders' }).dblclick()
  const input = page.getByRole('textbox', { name: 'Sheet name' })
  for (const [name, error] of [
    ['summary', 'already exists'],
    ['bad/name', 'cannot contain'],
    ['', '1 to 31'],
    ['12345678901234567890123456789012', '1 to 31'],
    ['History', 'reserved'],
  ]) {
    await input.fill(name!)
    await input.press('Enter')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toBeEnabled()
    await expect(page.locator('#sheet-command-error')).toContainText(error!)
    await expect(page.getByRole('tab', { name: 'Sales Orders' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  }
  await input.fill('Budget')
  await input.press('Enter')
  await expect(page.getByRole('tab', { name: 'Budget' })).toBeVisible()
  await expect(page.locator('#sheet-command-error')).toBeHidden()
})

test('F2 opens rename and Escape cancels without changing the sheet', async ({ page }) => {
  const tab = page.getByRole('tab', { name: 'Sales Orders' })
  await tab.focus()
  await tab.press('F2')
  const input = page.getByRole('textbox', { name: 'Sheet name' })
  await expect(input).toBeFocused()
  await input.fill('Discard')
  await input.press('Escape')
  await expect(input).toBeHidden()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
})

for (const source of ['Cell editor', 'Active cell value']) {
  test(`switch saves the ${source} draft on the original sheet`, async ({ page }) => {
    const cell = await select(page, 'B2', '1:1')
    if (source === 'Cell editor') await cell.dblclick()
    await page.getByRole('textbox', { name: source, exact: true }).fill('Saved customer')
    await switchSheet(page, 'Summary')
    await expect(page.locator('td[data-cell="1:1"]')).toHaveText('Saved customer')
    await switchSheet(page, 'Sales Orders')
    await expect(page.locator('td[data-cell="1:1"]')).toHaveText('Saved customer')
  })
}

test('invalid draft blocks switching without losing draft or source cell', async ({ page }) => {
  const cell = await select(page, 'A2', '1:0')
  await cell.dblclick()
  const input = page.getByRole('textbox', { name: 'Cell editor' })
  await input.fill('=SUM(')
  await page.getByRole('tab', { name: 'Summary' }).click()
  await expect(page.getByRole('alert')).toContainText('not saved')
  await expect(page.getByRole('tab', { name: 'Sales Orders' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(input).toHaveValue('=SUM(')
  await input.press('Escape')
  await expect(cell).toHaveText('SO-10001')
  await switchSheet(page, 'Summary')
})

test('switching from the last cell resets scroll and respects the smaller sheet bounds', async ({
  page,
}) => {
  await select(page, 'P1001', '1000:15')
  await switchSheet(page, 'Summary')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A1')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('First order total')
  await page.getByRole('button', { name: 'Previous sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sales Orders' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('button', { name: 'Next sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
})

test('sheet controls stay reachable with many tabs on desktop and narrow viewports', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (let index = 3; index <= 7; index++) {
    await page.getByRole('button', { name: 'New sheet' }).click()
    await expect(page.getByRole('tab', { name: `Sheet${index}` })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  }
  await page.screenshot({ path: info.outputPath('sheet-tabs-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await rename(page, 'September budget worksheet')
  const tab = page.getByRole('tab', { name: 'September budget worksheet' })
  await expect(tab).toBeInViewport()
  await page.getByRole('button', { name: 'Rename sheet' }).click()
  const input = page.getByLabel('Sheet name')
  await input.fill('Summary')
  await input.press('Enter')
  await expect(page.locator('#sheet-command-error')).toBeInViewport()
  await expect(input).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('sheet-tabs-narrow.png') })
  expect(errors).toEqual([])
})
