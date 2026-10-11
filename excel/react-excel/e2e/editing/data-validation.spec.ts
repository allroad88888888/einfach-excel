import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Data validation', exact: true })
const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
const list = (page: Page) => page.getByRole('combobox', { name: 'Choose cell value' })
async function go(page: Page, reference: string) {
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill(reference)
  await button(page, 'Go').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(bar(page)).toBeEnabled()
}
async function open(page: Page) {
  await button(page, 'Data validation').click()
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByLabel('Applies to')).toBeEnabled()
}
async function write(page: Page, value: string) {
  await bar(page).fill(value); await bar(page).press('Enter')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
})

test('integer seed rejects fractions without changing cell; corrected draft commits and undoes', async ({ page }) => {
  await go(page, 'H45')
  await expect(cell(page, '44:7')).toHaveText('5')
  await expect(button(page, 'Undo')).toBeDisabled()
  await write(page, '5.5')
  await expect(page.getByRole('alert')).toContainText('data validation rule')
  await expect(cell(page, '44:7')).toHaveText('5')
  await expect(bar(page)).toHaveValue('5.5')
  await write(page, '10')
  await expect(cell(page, '44:7')).toHaveText('10')
  await button(page, 'Undo').click()
  await expect(cell(page, '44:7')).toHaveText('5')
  await button(page, 'Redo').click()
  await expect(cell(page, '44:7')).toHaveText('10')
})

test('decimal seed accepts a fraction and rejects a formula outside bounds', async ({ page }) => {
  await go(page, 'H46'); await write(page, '0.75')
  await expect(cell(page, '45:7')).toHaveText('0.75')
  await go(page, 'H46'); await write(page, '=2')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(cell(page, '45:7')).toHaveText('0.75')
  await write(page, '=1/2')
  await expect(cell(page, '45:7')).toHaveText('0.5')
})

test('list seed chooses literal text, restores history and disappears on another cell', async ({ page }) => {
  await go(page, 'H47')
  await expect(list(page)).toBeVisible()
  await list(page).selectOption('2')
  await expect(cell(page, '46:7')).toHaveText('001')
  await expect(bar(page)).toHaveValue("'001")
  await expect(list(page)).toBeVisible()
  await list(page).selectOption('3')
  await expect(cell(page, '46:7')).toHaveText('=1+2')
  await button(page, 'Undo').click()
  await expect(cell(page, '46:7')).toHaveText('001')
  await button(page, 'Undo').click()
  await expect(cell(page, '46:7')).toHaveText('Ready')
  await go(page, 'H48'); await expect(list(page)).toHaveCount(0)
})

test('create list, clear one cell, undo and redo preserve neighboring rules', async ({ page }) => {
  await go(page, 'D45:D47'); await open(page)
  await page.getByLabel('Allow').selectOption('list')
  await page.getByLabel('Items, one per line').fill('Red\nGreen')
  await button(page, 'Apply').click(); await expect(dialog(page)).toHaveCount(0)
  await go(page, 'D46'); await expect(list(page)).toBeVisible()
  await open(page); await button(page, 'Clear validation').click()
  await expect(dialog(page)).toHaveCount(0); await expect(list(page)).toHaveCount(0)
  await go(page, 'D45'); await expect(list(page)).toBeVisible()
  await go(page, 'D46'); await button(page, 'Undo').click()
  await expect(list(page)).toBeVisible()
  await button(page, 'Redo').click(); await expect(list(page)).toHaveCount(0)
})

test('invalid rule stays correctable and cancel creates no history', async ({ page }) => {
  await go(page, 'D45'); await open(page)
  await page.getByLabel('Minimum').fill('20')
  await page.getByLabel('Maximum').fill('10')
  await button(page, 'Apply').click()
  await expect(dialog(page).getByRole('alert')).toBeVisible()
  await button(page, 'Cancel').click()
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('values paste rejects atomically while ordinary paste bypasses entry validation', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await go(page, 'H45:H46')
  await page.evaluate(() => navigator.clipboard.writeText('7\n2'))
  await button(page, 'Paste values only').click()
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText('Nothing was pasted')
  await expect(cell(page, '44:7')).toHaveText('5')
  await expect(cell(page, '45:7')).toHaveText('0.5')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Paste').click()
  await expect(cell(page, '44:7')).toHaveText('7')
  await expect(cell(page, '45:7')).toHaveText('2')
  await button(page, 'Undo').click()
  await expect(cell(page, '44:7')).toHaveText('5')
  await expect(cell(page, '45:7')).toHaveText('0.5')
})

test('row insertion moves list rule and undo restores the original cell', async ({ page }) => {
  await go(page, 'H47')
  await page.getByRole('combobox', { name: 'Insert or delete rows and columns' }).selectOption('insert-rows')
  await go(page, 'H48')
  await expect(cell(page, '47:7')).toHaveText('Ready')
  await expect(list(page)).toBeVisible()
  await go(page, 'H47'); await expect(list(page)).toHaveCount(0)
  await button(page, 'Undo').click(); await expect(list(page)).toBeVisible()
  await expect(cell(page, '46:7')).toHaveText('Ready')
})

for (const width of [1280, 390]) test(`validation form fits ${width}px`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 800 })
  await go(page, 'H47'); await open(page)
  await expect(page.getByLabel('Applies to')).toBeFocused()
  await expect(page.getByLabel('Items, one per line')).toHaveValue('Ready\nOn hold\n001\n=1+2')
  expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath(`validation-${width}.png`), fullPage: true })
  await button(page, 'Cancel').click()
  expect(errors).toEqual([])
})

for (const [kind, reference, coord, original, minimum, valid, invalid] of [
  ['date', 'H49', '48:7', '2026-10-11', '2026-10-01', '2026-10-31', '2026-11-01'],
  ['time', 'H50', '49:7', '12:00', '09:00', '17:00', '18:00'],
  ['text-length', 'H51', '50:7', '中文🙂', '2', 'four', 'x'],
]) test(`${kind} native seed enforces bounds and accepted input is undoable`, async ({ page }) => {
  await go(page, reference)
  await expect(cell(page, coord)).toHaveText(original)
  await open(page)
  await expect(page.getByLabel('Allow')).toHaveValue(kind)
  await expect(page.getByLabel('Minimum')).toHaveValue(minimum)
  await button(page, 'Cancel').click()
  await write(page, invalid)
  await expect(page.getByRole('alert')).toContainText('data validation rule')
  await expect(cell(page, coord)).toHaveText(original)
  await expect(bar(page)).toHaveValue(invalid)
  await expect(button(page, 'Undo')).toBeDisabled()
  await write(page, valid)
  await expect(cell(page, coord)).toHaveText(valid)
  await button(page, 'Undo').click()
  await expect(cell(page, coord)).toHaveText(original)
  await button(page, 'Redo').click()
  await expect(cell(page, coord)).toHaveText(valid)
})

test('bad date and time bounds stay correctable without creating history', async ({ page }) => {
  await go(page, 'D45'); await open(page)
  for (const [kind, min, max] of [
    ['date', '2026-02-29', '2026-03-01'], ['time', '00:00', '24:00'],
  ]) {
    await page.getByLabel('Allow').selectOption(kind)
    await page.getByLabel('Minimum').fill(min)
    await page.getByLabel('Maximum').fill(max)
    await button(page, 'Apply').click()
    await expect(dialog(page).getByRole('alert')).toBeVisible()
    await expect(page.getByLabel('Maximum')).toHaveValue(max)
  }
  await page.getByLabel('Maximum').fill('17:00')
  await button(page, 'Apply').click(); await expect(dialog(page)).toHaveCount(0)
  await write(page, '12:00'); await expect(cell(page, '44:3')).toHaveText('12:00')
  await button(page, 'Undo').click(); await expect(cell(page, '44:3')).toHaveText('')
  await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
  await open(page); await expect(page.getByLabel('Allow')).toHaveValue('whole-number')
})

test('length zero permits clearing when blank cells are not ignored', async ({ page }) => {
  await go(page, 'H51'); await open(page)
  await page.getByLabel('Minimum').fill('0')
  await button(page, 'Apply').click(); await expect(dialog(page)).toHaveCount(0)
  await write(page, ''); await expect(cell(page, '50:7')).toHaveText('')
  await button(page, 'Undo').click(); await expect(cell(page, '50:7')).toHaveText('中文🙂')
})

for (const width of [1280, 390]) test(`date validation form fits ${width}px`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 800 })
  await go(page, 'H49'); await open(page)
  await expect(page.getByLabel('Minimum')).toHaveValue('2026-10-01')
  await expect(page.getByText('Use YYYY-MM-DD. Both dates are included.')).toBeVisible()
  expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath(`date-validation-${width}.png`), fullPage: true })
  await button(page, 'Cancel').click()
  expect(errors).toEqual([])
})
