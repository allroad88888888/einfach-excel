import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Data validation', exact: true })
const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
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

for (const [operator, valid, invalid] of [
  ['between', '3', '5'], ['not-between', '5', '2'], ['equal', '2', '3'],
  ['not-equal', '3', '2'], ['greater-than', '3', '2'], ['greater-than-or-equal', '2', '1'],
  ['less-than', '1', '2'], ['less-than-or-equal', '2', '3'],
]) test(`${operator} enforces its native boundary and keeps a rejected draft correctable`, async ({ page }) => {
  await go(page, 'D45'); await open(page)
  await page.getByLabel('Condition', { exact: true }).selectOption(operator)
  const range = operator === 'between' || operator === 'not-between'
  await page.getByLabel(range ? 'Minimum' : 'Value', { exact: true }).fill('2')
  if (range) await page.getByLabel('Maximum').fill('4')
  else await expect(page.getByLabel('Maximum')).toHaveCount(0)
  await button(page, 'Apply').click(); await expect(dialog(page)).toHaveCount(0)
  if (range) for (const boundary of ['2', '4']) {
    await go(page, 'D45'); await write(page, boundary)
    if (operator === 'between') {
      await expect(cell(page, '44:3')).toHaveText(boundary)
      await button(page, 'Undo').click(); await expect(cell(page, '44:3')).toHaveText('')
    } else {
      await expect(page.getByRole('alert')).toContainText('data validation rule')
      await expect(cell(page, '44:3')).toHaveText(''); await bar(page).press('Escape')
    }
  }
  await go(page, 'D45')
  await write(page, valid); await expect(cell(page, '44:3')).toHaveText(valid)
  await go(page, 'D45'); await write(page, invalid)
  await expect(page.getByRole('alert')).toContainText('data validation rule')
  await expect(cell(page, '44:3')).toHaveText(valid)
  await expect(bar(page)).toHaveValue(invalid)
  // 直接修正同一份被拒草稿；等值提交不应额外占用一个历史步骤。
  await write(page, valid)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(cell(page, '44:7')).toHaveText('5')
  await expect(cell(page, '45:7')).toHaveText('0.5')
  await button(page, 'Undo').click(); await expect(cell(page, '44:3')).toHaveText('')
  await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await open(page); await expect(page.getByLabel('Condition', { exact: true })).toHaveValue(operator)
  await expect(page.getByLabel(range ? 'Minimum' : 'Value', { exact: true })).toHaveValue('2')
  if (range) await expect(page.getByLabel('Maximum')).toHaveValue('4')
})

for (const [kind, operator, cutoff, valid, invalid] of [
  ['date', 'greater-than', '2026-10-01', '2026-10-11', '2026-10-01'],
  ['time', 'less-than', '12:00', '09:00', '12:00'],
  ['text-length', 'equal', '3', '中文🙂', '中文'],
]) test(`${kind} comparison uses the typed native value`, async ({ page }) => {
  await go(page, 'D45'); await open(page)
  await page.getByLabel('Allow').selectOption(kind)
  await page.getByLabel('Condition', { exact: true }).selectOption(operator)
  await page.getByLabel('Value', { exact: true }).fill(cutoff)
  await button(page, 'Apply').click(); await expect(dialog(page)).toHaveCount(0)
  await write(page, valid)
  await expect(cell(page, '44:3')).toHaveText(kind === 'time' ? '9:00' : valid)
  await go(page, 'D45'); await write(page, invalid)
  await expect(page.getByRole('alert')).toContainText('data validation rule')
  await expect(cell(page, '44:3')).toHaveText(kind === 'time' ? '9:00' : valid)
})

test('comparison seeds preserve native conditions and do not create startup history', async ({ page }) => {
  for (const [ref, coord, value, operator] of [
    ['H53', '52:7', '5', 'equal'], ['H54', '53:7', '12', 'greater-than-or-equal'],
    ['H55', '54:7', '5', 'not-between'],
  ]) {
    await go(page, ref); await expect(cell(page, coord)).toHaveText(value)
    await open(page); await expect(page.getByLabel('Condition', { exact: true })).toHaveValue(operator)
    await button(page, 'Cancel').click()
  }
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('comparison rejects an entire values paste before changing any seed cell', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await go(page, 'H53:H55')
  await page.evaluate(() => navigator.clipboard.writeText('5\n9\n6'))
  await button(page, 'Paste values only').click()
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText('Nothing was pasted')
  await expect(cell(page, '52:7')).toHaveText('5')
  await expect(cell(page, '53:7')).toHaveText('12')
  await expect(cell(page, '54:7')).toHaveText('5')
  await expect(button(page, 'Undo')).toBeDisabled()
})

for (const width of [1280, 390]) test(`comparison form fits ${width}px`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 800 })
  await go(page, 'H55'); await open(page)
  await expect(page.getByLabel('Applies to')).toBeFocused()
  await expect(page.getByText(/Both boundaries are excluded/)).toBeVisible()
  expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath(`comparison-${width}.png`), fullPage: true })
  await page.getByLabel('Condition', { exact: true }).selectOption('greater-than-or-equal')
  await expect(page.getByLabel('Maximum')).toHaveCount(0)
  await expect(page.getByLabel('Value', { exact: true })).toBeVisible()
  await button(page, 'Cancel').click()
  expect(errors).toEqual([])
})
