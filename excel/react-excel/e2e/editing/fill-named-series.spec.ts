import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Fill series', exact: true })
async function select(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}
async function open(page: Page, address: string, kind: string) {
  await select(page, address)
  await page.getByRole('button', { name: 'Fill series', exact: true }).click()
  await dialog(page).getByLabel('Sequence type').selectOption(kind)
  await expect(dialog(page).getByLabel('Source sample count')).toHaveValue('1')
}
async function apply(page: Page) {
  await dialog(page).getByRole('button', { name: 'Apply series', exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
}
async function write(page: Page, address: string, value: string) {
  await select(page, address)
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill(value)
  await input.press('Enter')
}
async function drag(page: Page, address: string, target: string, copy = false) {
  await select(page, address)
  const handle = page.getByRole('button', { name: 'Drag to fill' })
  await handle.hover()
  await page.mouse.down()
  const box = await cell(page, target).boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 5 })
  if (copy) await page.keyboard.down('Control')
  await page.mouse.up()
  if (copy) await page.keyboard.up('Control')
  await expect(page.getByLabel('Fill status')).toContainText('Filled')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
})

test('weekday seed wraps through the weekend, carries bold and undoes in one step', async ({ page }) => {
  await open(page, 'A55:A59', 'weekday-name')
  await apply(page)
  for (const [row, value] of [[54, 'Friday'], [55, 'Saturday'], [56, 'Sunday'], [57, 'Monday'], [58, 'Tuesday']] as const)
    await expect(cell(page, `${row}:0`)).toHaveText(value)
  await expect(cell(page, '58:0')).toHaveCSS('font-weight', '700')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '58:0')).toHaveText('')
  await expect(cell(page, '54:0')).toHaveText('Friday')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '58:0')).toHaveText('Tuesday')
})

test('month seed wraps into January as text and carries italic', async ({ page }) => {
  await open(page, 'C55:C59', 'month-name')
  await apply(page)
  await expect(cell(page, '55:2')).toHaveText('Dec')
  await expect(cell(page, '56:2')).toHaveText('Jan')
  await expect(cell(page, '58:2')).toHaveText('Mar')
  await expect(cell(page, '58:2')).toHaveCSS('font-style', 'italic')
  await select(page, 'C57')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('Jan')
})

test('custom priority list cycles, preserves underline and keeps its draft for reuse', async ({ page }) => {
  await open(page, 'E55:E59', 'custom-list')
  await dialog(page).getByLabel('Custom list items').fill('Low\nMedium\nHigh')
  await apply(page)
  await expect(cell(page, '55:4')).toHaveText('Medium')
  await expect(cell(page, '56:4')).toHaveText('High')
  await expect(cell(page, '57:4')).toHaveText('Low')
  await expect(cell(page, '58:4')).toHaveText('Medium')
  await expect(cell(page, '58:4')).toHaveCSS('text-decoration-line', 'underline')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '55:4')).toHaveText('')
  await open(page, 'E55:E58', 'custom-list')
  await expect(dialog(page).getByLabel('Custom list items')).toHaveValue('Low\nMedium\nHigh')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Fill series', exact: true })).toBeFocused()
})

test('named source samples infer skipping and reverse order instead of assuming step one', async ({ page }) => {
  await write(page, 'A65', 'Mon')
  await write(page, 'A66', 'Wed')
  await open(page, 'A65:A69', 'weekday-name')
  await dialog(page).getByLabel('Source sample count').fill('2')
  await apply(page)
  await expect(cell(page, '66:0')).toHaveText('Fri')
  await expect(cell(page, '68:0')).toHaveText('Tue')
  await write(page, 'C65', 'Mar')
  await write(page, 'D65', 'Feb')
  await open(page, 'C65:F65', 'month-name')
  await expect(dialog(page).getByLabel('Direction')).toHaveValue('right')
  await dialog(page).getByLabel('Source sample count').fill('2')
  await apply(page)
  await expect(cell(page, '64:4')).toHaveText('Jan')
  await expect(cell(page, '64:5')).toHaveText('Dec')
})

test('fill handle detects English and Chinese names from one native sample', async ({ page }) => {
  for (const [address, target, value] of [
    ['A55', '56:0', 'Sunday'], ['A60', '61:0', '星期日'],
    ['C55', '56:2', 'Jan'], ['C60', '61:2', '1月'],
  ]) {
    await drag(page, address!, target!)
    await expect(cell(page, target!)).toHaveText(value!)
  }
})

test('copy modifier bypasses automatic named inference', async ({ page }) => {
  await drag(page, 'A55', '57:0', true)
  await expect(cell(page, '57:0')).toHaveText('Friday')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '57:0')).toHaveText('')
})

test('duplicate custom values reject before mutation, then correction can retry', async ({ page }) => {
  await open(page, 'E55:E58', 'custom-list')
  await dialog(page).getByLabel('Custom list items').fill('Low\nlow')
  await dialog(page).getByRole('button', { name: 'Apply series' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('unique')
  await expect(cell(page, '55:4')).toHaveText('')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await dialog(page).getByLabel('Custom list items').fill('Low\nMedium\nHigh')
  await apply(page)
  await expect(cell(page, '55:4')).toHaveText('Medium')
})

test('mismatched list and formula samples retain targets and show native errors', async ({ page }) => {
  await open(page, 'E55:E58', 'weekday-name')
  await dialog(page).getByRole('button', { name: 'Apply series' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('do not match this named list')
  await page.keyboard.press('Escape')
  await open(page, 'B71:B73', 'month-name')
  await dialog(page).getByRole('button', { name: 'Apply series' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('non-formula')
  await expect(cell(page, '72:1')).toHaveText('')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('hidden rows participate and named fill does not replace the clipboard snapshot', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await select(page, 'A55')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByLabel('Clipboard status')).toContainText('Copied')
  await write(page, 'H8', 'Jan')
  await open(page, 'H8:H12', 'month-name')
  await apply(page)
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('unhide-all')
  await select(page, 'H10')
  await expect(cell(page, '9:7')).toHaveText('Mar')
  await select(page, 'H14')
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(cell(page, '13:7')).toHaveText('Friday')
})

test('a thousand-row named series reaches the final record and undoes atomically', async ({ page }) => {
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await write(page, 'A2', 'Friday')
  await open(page, 'A2:A1001', 'weekday-name')
  await apply(page)
  await select(page, 'A1001')
  await expect(cell(page, '1000:0')).toHaveText('Wednesday')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1000:0')).toHaveText('SO-11000')
})

for (const width of [1280, 390]) {
  test(`custom list panel and error remain usable at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 800 })
    await open(page, 'E55:E58', 'custom-list')
    await dialog(page).getByLabel('Custom list items').fill('Low\nMedium\nHigh')
    for (const control of await dialog(page).locator('input, select, textarea, button').all())
      await expect(control).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`custom-list-${width}.png`) })
    await dialog(page).getByLabel('Custom list items').fill('Low\nlow')
    await dialog(page).getByRole('button', { name: 'Apply series' }).click()
    await expect(dialog(page).getByRole('alert')).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`custom-list-error-${width}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
