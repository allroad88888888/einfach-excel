import { expect, test, type Page } from '@playwright/test'
import { select, paste } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const preview = (page: Page) => page.getByRole('status', { name: 'Number format preview' })
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
async function open(page: Page, category?: string) {
  await page.getByRole('button', { name: 'Number format settings', exact: true }).click()
  if (category) await page.getByLabel('Number format category').selectOption(category)
}
async function apply(page: Page) {
  await page.getByRole('button', { name: 'Apply number format', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function input(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await formula(page).fill(value)
  await formula(page).press('Enter')
  await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
  await select(page, address, coord)
}
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('new native seeds retain long IDs, leading zeros and a selectable date style', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  for (const [address, coord, category, display] of [
    ['A96', '95:0', 'text', '12345678901234567890'],
    ['B96', '95:1', 'text', '00123'], ['C96', '95:2', 'date', '29-Feb-24'],
  ]) {
    await select(page, address!, coord!)
    await expect(cell(page, coord!)).toHaveText(display!)
    await open(page)
    await expect(page.getByLabel('Number format category')).toHaveValue(category!)
    await expect(preview(page)).toHaveText(display!)
    await page.keyboard.press('Escape')
  }
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('date preview does not write until Apply and one undo restores the old display', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'C21', '20:2')
  await open(page)
  await page.getByLabel('Date style').selectOption('dddd, mmmm d, yyyy')
  await expect(preview(page)).toHaveText('Thursday, February 29, 2024')
  await expect(cell(page, '20:2')).toHaveText('2024-02-29')
  await apply(page)
  await expect(cell(page, '20:2')).toHaveText('Thursday, February 29, 2024')
  await expect(formula(page)).toHaveValue('45351')
  await expect(cell(page, '20:2')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '19:2')).toHaveText('2024-01-31')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '20:2')).toHaveText('2024-02-29')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await open(page)
  await expect(page.getByLabel('Date style')).toHaveValue('dddd, mmmm d, yyyy')
})

for (const width of [1280, 390]) test(`date shortcut replaces only the seeded pattern and undoes once at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'C96', '95:2')
  await expect(cell(page, '95:2')).toHaveText('29-Feb-24')
  await page.getByRole('button', { name: 'Date format', exact: true }).click()
  await expect(cell(page, '95:2')).toHaveText('2024-02-29')
  await expect(formula(page)).toHaveValue('45351')
  await expect(cell(page, '95:2')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '95:1')).toHaveText('00123')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '95:2')).toHaveText('29-Feb-24')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '95:2')).toHaveText('2024-02-29')
  await open(page)
  await expect(page.getByLabel('Date style')).toHaveValue('yyyy-mm-dd')
})

test('Text does not convert an existing formula but subsequent input stays literal', async ({ page }) => {
  await select(page, 'G2', '1:6')
  await open(page, 'text')
  await expect(preview(page)).toHaveText('79')
  await apply(page)
  await expect(cell(page, '1:6')).toHaveText('79')
  await expect(formula(page)).toHaveValue('=E2*F2')
  await expect(cell(page, '2:6')).toHaveText('658')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await open(page)
  await expect(page.getByLabel('Number format category')).toHaveValue('number')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled()
  await open(page)
  await expect(page.getByLabel('Number format category')).toHaveValue('text')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await input(page, 'G2', '1:6', '=2+3')
  await expect(cell(page, '1:6')).toHaveText('=2+3')
  await expect(formula(page)).toHaveValue("'=2+3")
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1:6')).toHaveText('79')
  await input(page, 'G2', '1:6', '00123')
  await expect(cell(page, '1:6')).toHaveText('00123')
})

test('Text column applies to external paste while the adjacent General column still parses values', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await page.getByRole('columnheader', { name: 'Select column D', exact: true }).click()
  await open(page, 'text')
  await apply(page)
  await select(page, 'D4', '3:3')
  await page.evaluate(() => navigator.clipboard.writeText('00123\t00123\n=SUM(\t=2+3'))
  await paste(page)
  for (const [coord, value] of [['3:3', '00123'], ['3:4', '123'], ['4:3', '=SUM('], ['4:4', '5']])
    await expect(cell(page, coord!)).toHaveText(value!)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '3:3')).toHaveText('')
  await expect(cell(page, '4:4')).toHaveText('')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '4:3')).toHaveText('=SUM(')
})

for (const [value, category, digits, expected] of [
  ['2.5', 'number', '0', '3'], ['0.025', 'percent', '0', '3%'],
  ['-1234.125', 'currency', '2', '€-1,234.13'],
]) test(`${category} preview, applied display and raw input share native rounding`, async ({ page }) => {
  await input(page, 'F3', '2:5', value!)
  await open(page, category)
  await page.getByLabel('Decimal places', { exact: true }).fill(digits!)
  if (category === 'currency') await page.getByLabel('Currency symbol').fill('€')
  await expect(preview(page)).toHaveText(expected!)
  await apply(page)
  await expect(cell(page, '2:5')).toHaveText(expected!)
  await expect(formula(page)).toHaveValue(value!)
})

test('preview reads blank, text and formula errors without inventing a sample or writing', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  for (const [address, coord, expected] of [
    ['A94', '93:0', '(Empty)'], ['C94', '93:2', '#DIV/0!'], ['A96', '95:0', '12345678901234567890'],
  ]) {
    await select(page, address!, coord!)
    await open(page, 'date')
    await expect(preview(page)).toHaveText(expected!)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

for (const width of [1280, 390]) test(`format preview fits and stays keyboard usable at ${width}px`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 850 })
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'C96', '95:2')
  await open(page)
  await page.getByLabel('Date style').selectOption('dddd, mmmm d, yyyy')
  await expect(preview(page)).toHaveText('Thursday, February 29, 2024')
  const dialog = page.getByRole('dialog')
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  const box = await dialog.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width)
  await page.screenshot({ path: info.outputPath(`date-preview-${width}.png`) })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Number format settings' })).toBeFocused()
  await select(page, 'A96', '95:0')
  await open(page)
  await expect(preview(page)).toHaveText('12345678901234567890')
  await page.screenshot({ path: info.outputPath(`text-preview-${width}.png`) })
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Apply number format' })).toBeFocused()
  expect(errors).toEqual([])
})
