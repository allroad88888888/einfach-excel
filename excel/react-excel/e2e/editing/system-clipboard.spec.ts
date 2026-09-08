import { expect, test } from '@playwright/test'
import { select, copy, paste } from '../support/clipboard'

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

test('system copy freezes value and format and permits repeated pastes', async ({ page }) => {
  await select(page, 'A2', '1:0')
  await copy(page)
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SO-10001')
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('')
  const target = await select(page, 'A3', '2:0')
  await paste(page)
  await expect(target).toHaveText('SO-10001')
  await expect(target).toHaveCSS('font-weight', '700')
  const next = await select(page, 'A4', '3:0')
  await paste(page)
  await expect(next).toHaveText('SO-10001')
})

test('keyboard copy and paste preserve formulas with relative references', async ({ page }) => {
  const expected = await (await select(page, 'G3', '2:6')).textContent()
  await select(page, 'G2', '1:6')
  await page.locator('[data-workbook-grid]').press('ControlOrMeta+c')
  await expect(page.getByLabel('Clipboard status')).toContainText('Copied')
  const target = await select(page, 'G3', '2:6')
  await page.locator('[data-workbook-grid]').press('ControlOrMeta+v')
  await expect(page.getByLabel('Clipboard status')).toHaveText('Pasted cells.')
  await expect(target).toHaveText(expected ?? '')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=(E3*F3)')
})

test('cut only clears on paste and formulas follow the moved quantity', async ({ page }) => {
  const total = await (await select(page, 'G2', '1:6')).textContent()
  const source = await select(page, 'E2', '1:4')
  const value = await source.textContent()
  await page.locator('[data-workbook-grid]').press('ControlOrMeta+x')
  await expect(page.getByLabel('Clipboard status')).toContainText('ready to move')
  await expect(source).toHaveText(value ?? '')
  const target = await select(page, 'E4', '3:4')
  await paste(page)
  await expect(target).toHaveText(value ?? '')
  await expect(target).toHaveCSS('color', 'rgb(192, 0, 0)')
  await expect(await select(page, 'E2', '1:4')).toHaveText('')
  const result = await select(page, 'G2', '1:6')
  await expect(result).toHaveText(total ?? '')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=(E4*F2)')
})

test('external TSV pastes a rectangle with quotes, empty cells, booleans and formulas', async ({
  page,
}) => {
  await page.evaluate(() => navigator.clipboard.writeText('7\ttrue\t"two\nlines"\n8\t\t=I10*2'))
  await select(page, 'I10', '9:8')
  await page.locator('[data-workbook-grid]').press('ControlOrMeta+v')
  await expect(page.getByLabel('Clipboard status')).toHaveText('Pasted cells.')
  await expect(page.locator('td[data-cell="9:8"]')).toHaveText('7')
  await expect(await select(page, 'J10', '9:9')).toHaveText('TRUE')
  await expect(await select(page, 'K10', '9:10')).toHaveText('two\nlines')
  await expect(await select(page, 'J11', '10:9')).toHaveText('')
  await expect(await select(page, 'K11', '10:10')).toHaveText('14')
})

test('paste beyond sheet bounds reports an error without erasing the cut source', async ({
  page,
}) => {
  await select(page, 'A2:B2', '1:0')
  await copy(page, 'Cut')
  await select(page, 'P1001', '1000:15')
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText(
    'beyond the sheet',
  )
  await expect(await select(page, 'A2', '1:0')).toHaveText('SO-10001')
})

test('whole-column copy includes rows outside the mounted viewport', async ({ page }) => {
  await page.getByRole('columnheader', { name: 'Select column B', exact: true }).click()
  await copy(page)
  await select(page, 'J1', '0:9')
  await paste(page)
  const last = await select(page, 'J1001', '1000:9')
  const expected = await (await select(page, 'B1001', '1000:1')).textContent()
  await select(page, 'J1001', '1000:9')
  await expect(last).toHaveText(expected ?? '')
})

test('clipboard rejection feedback remains readable on desktop and narrow screens', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await select(page, 'A2:B2', '1:0')
  await copy(page, 'Cut')
  await select(page, 'P1001', '1000:15')
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  const feedback = page.getByRole('alert', { name: 'Clipboard status' })
  await expect(feedback).toContainText('beyond the sheet')
  await page.screenshot({ path: info.outputPath('clipboard-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(feedback).toBeInViewport()
  const fits = await feedback.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return (
      bounds.left >= 0 &&
      bounds.right <= window.innerWidth &&
      element.scrollWidth <= element.clientWidth + 1
    )
  })
  expect(fits).toBe(true)
  await page.screenshot({ path: info.outputPath('clipboard-narrow.png') })
  expect(errors).toEqual([])
})
