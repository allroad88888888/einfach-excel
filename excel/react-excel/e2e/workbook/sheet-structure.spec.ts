import { expect, test, type Page } from '@playwright/test'
import { copy, paste, select } from '../support/clipboard'

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

async function switchSheet(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('td[data-cell="0:0"]')).toBeVisible()
}

async function remove(page: Page, name: string) {
  await page.getByRole('button', { name: 'Delete sheet', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(name)
  await dialog.getByRole('button', { name: 'Delete worksheet', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('tab', { name, exact: true })).toBeHidden()
}

test('moves both ways without changing selected cells or their seed styles', async ({ page }) => {
  await select(page, 'A2:C3', '1:0')
  await expect(page.getByRole('button', { name: 'Move sheet left' })).toBeDisabled()
  await page.getByRole('button', { name: 'Move sheet right' }).click()
  await expect(page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab')).toHaveText([
    'Summary',
    'Sales Orders',
  ])
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A2:C3')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveCSS('font-weight', '700')
  await expect(page.getByRole('button', { name: 'Move sheet right' })).toBeDisabled()
  await page.getByRole('button', { name: 'Move sheet left' }).click()
  await expect(page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab')).toHaveText([
    'Sales Orders',
    'Summary',
  ])
})

test('reordered native indices still edit the intended source and recalculate Summary', async ({
  page,
}) => {
  await switchSheet(page, 'Summary')
  await page.getByRole('button', { name: 'Move sheet left' }).click()
  await expect(page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab')).toHaveText([
    'Summary',
    'Sales Orders',
  ])
  await switchSheet(page, 'Sales Orders')
  await select(page, 'E2', '1:4')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('3')
  await formula.press('Enter')
  await expect(page.locator('td[data-cell="1:4"]')).toHaveText('3')
  await switchSheet(page, 'Summary')
  await expect(page.locator('td[data-cell="0:1"]')).toHaveText('237')
  await expect(page.locator('td[data-cell="1:1"]')).toHaveText('Acme Co.')
})

test('delete cancellation and Escape never remove data', async ({ page }) => {
  for (const cancel of ['button', 'escape']) {
    await page.getByRole('button', { name: 'Delete sheet', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Sales Orders')
    await expect(dialog).toContainText('session history limits')
    if (cancel === 'button') await dialog.getByRole('button', { name: 'Cancel' }).click()
    else await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab'),
    ).toHaveCount(2)
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  }
})

test('deletes active sheet, chooses the neighbor, and rejects deleting the last sheet', async ({
  page,
}) => {
  await switchSheet(page, 'Summary')
  await remove(page, 'Summary')
  await expect(page.getByRole('tab', { name: 'Sales Orders' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await expect(page.getByRole('button', { name: 'Delete sheet', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet2' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete sheet', exact: true })).toBeEnabled()
})

test('deleting a formula source creates permanent REF errors even after reusing its name', async ({
  page,
}) => {
  await remove(page, 'Sales Orders')
  await expect(page.locator('td[data-cell="0:1"]')).toHaveText('#REF!')
  await expect(page.locator('td[data-cell="1:1"]')).toHaveText('#REF!')
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet2' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Rename sheet' }).click()
  await page.getByLabel('Sheet name').fill('Sales Orders')
  await page.getByLabel('Sheet name').press('Enter')
  await expect(page.getByRole('tab', { name: 'Sales Orders' })).toBeVisible()
  await select(page, 'G2', '1:6')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('999')
  await formula.press('Enter')
  await expect(page.locator('td[data-cell="1:6"]')).toHaveText('999')
  await switchSheet(page, 'Summary')
  await expect(page.locator('td[data-cell="0:1"]')).toHaveText('#REF!')
})

test('deleting middle and final tabs selects the right and then left neighbor', async ({
  page,
}) => {
  for (const name of ['Sheet3', 'Sheet4']) {
    await page.getByRole('button', { name: 'New sheet' }).click()
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
  }
  await switchSheet(page, 'Sheet3')
  await remove(page, 'Sheet3')
  await expect(page.getByRole('tab', { name: 'Sheet4' })).toHaveAttribute('aria-selected', 'true')
  await remove(page, 'Sheet4')
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
})

test('moving a cut source retains its identity and never clears neighboring sheet cells', async ({
  page,
}) => {
  await select(page, 'A2', '1:0')
  await copy(page, 'Cut')
  await page.getByRole('button', { name: 'Move sheet right' }).click()
  await expect(page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab')).toHaveText([
    'Summary',
    'Sales Orders',
  ])
  await select(page, 'A10', '9:0')
  await paste(page)
  await expect(page.locator('td[data-cell="9:0"]')).toHaveText('SO-10001')
  await expect(await select(page, 'A2', '1:0')).toHaveText('')
  await switchSheet(page, 'Summary')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('First order total')
})

test('deleting the cut source refuses stale paste without erasing the surviving sheet', async ({
  page,
}) => {
  await select(page, 'A2', '1:0')
  await copy(page, 'Cut')
  await remove(page, 'Sales Orders')
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(page.getByLabel('Clipboard status')).toContainText('worksheet was deleted')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('First order total')
})

test('cut follows index shifts when an earlier unrelated sheet is deleted', async ({ page }) => {
  await switchSheet(page, 'Summary')
  // A10 现在是初始隐藏样例；先通过真实菜单恢复，再验证跨索引剪切。
  const visibility = page.getByRole('combobox', { name: 'Row and column visibility' })
  await visibility.selectOption('unhide-all')
  await expect(visibility).toBeEnabled()
  await select(page, 'A1', '0:0')
  await copy(page, 'Cut')
  await switchSheet(page, 'Sales Orders')
  await remove(page, 'Sales Orders')
  await select(page, 'A10', '9:0')
  await paste(page)
  await expect(page.locator('td[data-cell="9:0"]')).toHaveText('First order total')
  await expect(await select(page, 'A1', '0:0')).toHaveText('')
})

test('copy formulas follow a renamed source while the clipboard result stays frozen', async ({
  page,
}) => {
  await switchSheet(page, 'Summary')
  await select(page, 'B1', '0:1')
  await copy(page)
  await switchSheet(page, 'Sales Orders')
  await page.getByRole('button', { name: 'Rename sheet' }).click()
  await page.getByLabel('Sheet name').fill('Budget')
  await page.getByLabel('Sheet name').press('Enter')
  await expect(page.getByRole('tab', { name: 'Budget' })).toBeVisible()
  await switchSheet(page, 'Summary')
  await select(page, 'B1', '0:1')
  await paste(page)
  await expect(page.locator('td[data-cell="0:1"]')).toHaveText('79')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=Budget!G2')
})

test('delete confirmation and compact controls work at desktop and narrow widths', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const move = page.getByRole('button', { name: 'Move sheet right' })
    await expect(move).toBeInViewport()
    await page.getByRole('button', { name: 'Delete sheet', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`sheet-structure-${width}.png`) })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  }
  expect(errors).toEqual([])
})
