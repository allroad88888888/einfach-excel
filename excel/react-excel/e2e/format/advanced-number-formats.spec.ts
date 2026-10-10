import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function open(page: Page, category?: string) {
  await page.getByRole('button', { name: 'Number format settings' }).click()
  if (category) await page.getByLabel('Number format category').selectOption(category)
}
async function apply(page: Page) {
  await page.getByRole('button', { name: 'Apply number format' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function input(page: Page, value: string) {
  await select(page, 'F3', '2:5')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill(value)
  await formula.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
  await select(page, 'F3', '2:5')
  await expect(formula).toHaveValue(value)
}
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('three new seed categories survive the real native import and reopen correctly', async ({ page }) => {
  for (const [address, coord, kind, display] of [
    ['G13', '12:6', 'scientific', '5.88E+02'],
    ['O13', '12:14', 'fraction', '1/20'],
    ['O14', '13:14', 'time', '02:24:00'],
  ]) {
    await select(page, address!, coord!)
    await expect(cell(page, coord!)).toHaveText(display!)
    await open(page)
    await expect(page.getByLabel('Number format category')).toHaveValue(kind!)
    await page.keyboard.press('Escape')
  }
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('scientific half-up precision preserves formulas and supports decimal shortcuts', async ({ page }) => {
  await input(page, '=12345')
  await open(page, 'scientific')
  await page.getByRole('spinbutton', { name: 'Decimal places', exact: true }).fill('3')
  await apply(page)
  await expect(cell(page, '2:5')).toHaveText('1.235E+04')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=12345')
  await page.getByRole('button', { name: 'Increase decimal places' }).click()
  await expect(cell(page, '2:5')).toHaveText('1.2345E+04')
  await page.getByRole('button', { name: 'Decrease decimal places' }).click()
  await expect(cell(page, '2:5')).toHaveText('1.235E+04')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:5')).toHaveText('1.2345E+04')
})

test('fractions use precision or fixed denominators, retain the value and undo one write', async ({ page }) => {
  await input(page, '5.3')
  await open(page, 'fraction')
  await page.getByLabel('Denominator').selectOption('two-digit')
  await apply(page)
  await expect(cell(page, '2:5')).toHaveText('5 3/10')
  await open(page)
  await page.getByLabel('Denominator').selectOption('8')
  await apply(page)
  await expect(cell(page, '2:5')).toHaveText('5 2/8')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('5.3')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:5')).toHaveText('5 3/10')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '2:5')).toHaveText('5 2/8')
})

test('time displays day fractions, clock rollover and elapsed hours without changing values', async ({ page }) => {
  await input(page, '1.5')
  await open(page, 'time')
  await page.getByLabel('Time format', { exact: true }).selectOption('h:mm AM/PM')
  await apply(page)
  await expect(cell(page, '2:5')).toHaveText('12:00 PM')
  await open(page)
  await page.getByLabel('Time format', { exact: true }).selectOption('[h]:mm:ss')
  await apply(page)
  await expect(cell(page, '2:5')).toHaveText('36:00:00')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('1.5')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:5')).toHaveText('12:00 PM')
  await input(page, '-0.25')
  await expect(cell(page, '2:5')).toHaveText('#####')
  await page.getByRole('button', { name: 'General format', exact: true }).click()
  await expect(cell(page, '2:5')).toHaveText('-0.25')
})

test('later column scientific style overrides row fraction and reaches the last record', async ({ page }) => {
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await open(page, 'fraction')
  await apply(page)
  await page.getByRole('columnheader', { name: 'Select column F', exact: true }).click()
  await open(page, 'scientific')
  await apply(page)
  await expect(cell(page, '1:5')).toHaveText('7.90E+01')
  await expect(cell(page, '1:4')).toHaveText('1')
  await select(page, 'F1001', '1000:5')
  await expect(cell(page, '1000:5')).toHaveText('1.19E+02')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1000:5')).toHaveText('119')
})

test('format-only clipboard paste keeps scientific metadata but not the source value', async ({ page }) => {
  await select(page, 'G13', '12:6')
  await copy(page)
  await select(page, 'F3', '2:5')
  await paste(page, 'Paste formatting only')
  await expect(cell(page, '2:5')).toHaveText('3.29E+02')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('329')
  await open(page)
  await expect(page.getByLabel('Number format category')).toHaveValue('scientific')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:5')).toHaveText('329')
})

test('native time text survives sheet switching and auto-fit measures the displayed duration', async ({ page }) => {
  await input(page, '100.5')
  await open(page, 'time')
  await page.getByLabel('Time format', { exact: true }).selectOption('[h]:mm:ss')
  await apply(page)
  await expect(cell(page, '2:5')).toHaveText('2412:00:00')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'F3', '2:5')
  await expect(cell(page, '2:5')).toHaveText('2412:00:00')
  const handle = page.getByRole('separator', { name: 'Resize column F', exact: true })
  const before = await handle.getAttribute('aria-valuenow')
  await handle.dblclick()
  await expect.poll(async () => handle.getAttribute('aria-valuenow')).not.toBe(before)
  const content = cell(page, '2:5').locator('.cell-content')
  await expect.poll(async () => content.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  // 名称框返回后仍读取同一 Rust 时间格式，不会被常规数值格式覆盖。
  await open(page)
  await expect(page.getByLabel('Time format', { exact: true })).toHaveValue('[h]:mm:ss')
})

test('all new categories format frozen merged fragments from the native anchor', async ({ page }) => {
  await select(page, 'F3', '2:5')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'E2:G4', '1:4')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Merge cells', exact: true }).click()
  const fragments = page.locator('[data-merged-cell="true"]')
  await expect(fragments).toHaveCount(4)
  for (const [category, expected] of [['scientific', '1.00E+00'], ['fraction', '1'], ['time', '00:00:00']]) {
    await open(page, category)
    await apply(page)
    for (const fragment of await fragments.all()) {
      await expect(fragment).toHaveText(expected!)
      await expect(fragment).toHaveCSS('color', 'rgb(192, 0, 0)')
    }
  }
})

for (const width of [1280, 390]) {
  test(`fraction and time controls fit ${width}px and keyboard cancel restores focus`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    await select(page, 'O13', '12:14')
    await open(page)
    const category = page.getByLabel('Number format category')
    await category.press('Tab')
    await expect(page.getByLabel('Denominator')).toBeFocused()
    await page.getByLabel('Denominator').selectOption('three-digit')
    await page.screenshot({ path: info.outputPath(`fraction-${width}.png`) })
    await category.selectOption('time')
    await page.getByLabel('Time format', { exact: true }).selectOption('h:mm:ss AM/PM')
    const dialog = page.getByRole('dialog')
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`time-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Number format settings' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}
