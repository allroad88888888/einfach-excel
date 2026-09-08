import { expect, test, type Page } from '@playwright/test'
import { copy, select } from '../support/clipboard'

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab')
const cell = (page: Page, key: string) => page.locator(`td[data-cell="${key}"]`)
const history = (page: Page, action: 'Undo' | 'Redo') =>
  page.getByRole('button', { name: action, exact: true }).click()

async function switchSheet(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(cell(page, '0:0')).toBeVisible()
  if (name === 'Summary') await expect(cell(page, '0:0')).toHaveText('First order total')
}
async function rename(page: Page, name: string) {
  await page.getByRole('button', { name: 'Rename sheet' }).click()
  await page.getByLabel('Sheet name').fill(name)
  await page.getByLabel('Sheet name').press('Enter')
  await expect(page.getByRole('tab', { name, exact: true })).toBeVisible()
}
async function remove(page: Page, name: string) {
  await page.getByRole('button', { name: 'Delete sheet', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete worksheet' }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveCount(0)
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('rename undo and redo update tabs and exact cross-sheet formula sources', async ({ page }) => {
  await rename(page, "O'Brien Orders")
  await switchSheet(page, 'Summary')
  await select(page, 'B1', '0:1')
  await history(page, 'Undo')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary'])
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(
    "='Sales Orders'!G2",
  )
  await expect(cell(page, '0:1')).toHaveText('79')
  await history(page, 'Redo')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(
    "='O''Brien Orders'!G2",
  )
})

test('move undo keeps selected range and native data on the same sheet', async ({ page }) => {
  await select(page, 'A2:C3', '1:0')
  await page.getByRole('button', { name: 'Move sheet right' }).click()
  await expect(tabs(page)).toHaveText(['Summary', 'Sales Orders'])
  await history(page, 'Undo')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary'])
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A2:C3')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await history(page, 'Redo')
  await expect(tabs(page)).toHaveText(['Summary', 'Sales Orders'])
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('delete undo restores formulas and seed formatting, redo deletes again', async ({ page }) => {
  await remove(page, 'Sales Orders')
  await expect(cell(page, '0:1')).toHaveText('#REF!')
  await history(page, 'Undo')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary'])
  await expect(cell(page, '0:1')).toHaveText('79')
  await switchSheet(page, 'Sales Orders')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
  await history(page, 'Redo')
  await expect(tabs(page)).toHaveText(['Summary'])
  await expect(cell(page, '0:1')).toHaveText('#REF!')
})

test('undo add from the last cell switches to the small neighboring canvas', async ({ page }) => {
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')
  await select(page, 'P1001', '1000:15')
  await history(page, 'Undo')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary'])
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A1')
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await history(page, 'Redo')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary', 'Sheet3'])
  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
  await switchSheet(page, 'Sheet3')
  await expect(await select(page, 'P1001', '1000:15')).toHaveText('')
})

test('restored small sheet keeps original row heights and column widths', async ({ page }) => {
  await switchSheet(page, 'Summary')
  const before = await cell(page, '0:0').boundingBox()
  await remove(page, 'Summary')
  await history(page, 'Undo')
  await switchSheet(page, 'Summary')
  const after = await cell(page, '0:0').boundingBox()
  expect(after?.height).toBe(before?.height)
  expect(after?.width).toBe(before?.width)
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A1')
})

test('edit and worksheet operations share one native history without starting another Worker', async ({
  page,
}) => {
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await select(page, 'E2', '1:4')
  await page.getByRole('textbox', { name: 'Active cell value' }).fill('3')
  await page.getByRole('textbox', { name: 'Active cell value' }).press('Enter')
  await expect(cell(page, '1:4')).toHaveText('3')
  await rename(page, 'Orders')
  await page.getByRole('button', { name: 'Move sheet right' }).click()
  await remove(page, 'Orders')
  await expect(cell(page, '0:1')).toHaveText('#REF!')
  for (let index = 0; index < 4; index++) await history(page, 'Undo')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary'])
  await expect(cell(page, '0:1')).toHaveText('79')
  for (let index = 0; index < 4; index++) await history(page, 'Redo')
  await expect(tabs(page)).toHaveText(['Summary'])
  await expect(cell(page, '0:1')).toHaveText('#REF!')
  expect(workers).toEqual([])
})

test('structure history invalidates the old clipboard with a visible explanation', async ({
  page,
}) => {
  await select(page, 'A2', '1:0')
  await copy(page)
  await rename(page, 'Orders')
  await history(page, 'Undo')
  await select(page, 'A4', '3:0')
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(page.getByLabel('Clipboard status')).toContainText('Copy or cut again')
  await expect(cell(page, '3:0')).toHaveText('00123')
})

test('failed and unchanged renames preserve the redo branch', async ({ page }) => {
  await rename(page, 'Budget')
  await history(page, 'Undo')
  await expect(page.getByRole('tab', { name: 'Sales Orders' })).toBeVisible()
  await page.getByRole('button', { name: 'Rename sheet' }).click()
  await page.getByLabel('Sheet name').fill('bad/name')
  await page.getByLabel('Sheet name').press('Enter')
  await expect(page.locator('#sheet-command-error')).toContainText('cannot contain')
  await page.getByLabel('Sheet name').press('Escape')
  await rename(page, 'Sales Orders')
  await history(page, 'Redo')
  await expect(tabs(page)).toHaveText(['Budget', 'Summary'])
})

test('undoing a same-name replacement restores the original worksheet identity and data', async ({
  page,
}) => {
  await remove(page, 'Sales Orders')
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet2' })).toHaveAttribute('aria-selected', 'true')
  await rename(page, 'Sales Orders')
  for (let step = 0; step < 3; step++) await history(page, 'Undo')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary'])
  await expect(cell(page, '0:1')).toHaveText('79')
  await switchSheet(page, 'Sales Orders')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  for (let step = 0; step < 3; step++) await history(page, 'Redo')
  await expect(tabs(page)).toHaveText(['Summary', 'Sales Orders'])
  await expect(cell(page, '0:1')).toHaveText('#REF!')
  await switchSheet(page, 'Sales Orders')
  await expect(cell(page, '1:0')).toHaveText('')
})

test('worksheet history labels remain usable on desktop and narrow screens', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await remove(page, 'Sales Orders')
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.getByRole('button', { name: 'Recent operations', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Recent operations' })
    await expect(dialog.getByRole('listitem')).toHaveText(
      'Delete worksheetSales Orders · Worksheet',
    )
    await expect(dialog).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Close history' })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`sheet-history-${width}.png`) })
    await page.keyboard.press('Escape')
  }
  expect(errors).toEqual([])
})
