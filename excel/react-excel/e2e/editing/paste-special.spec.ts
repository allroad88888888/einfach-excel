import { expect, test } from '@playwright/test'
import { select, copy, paste } from '../support/clipboard'

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

test('values-only uses the unrounded Rust value and keeps destination formatting', async ({
  page,
}) => {
  await select(page, 'B3', '2:1')
  await page.getByRole('button', { name: 'Italic', exact: true }).click()
  await expect(page.locator('td[data-cell="2:1"]')).toHaveCSS('font-style', 'italic')
  const source = await select(page, 'P3', '2:15')
  await expect(source).toHaveText('$125')
  await copy(page)
  const target = await select(page, 'B3', '2:1')
  await paste(page, 'Paste values only')
  await expect(target).toHaveText('125.02')
  await expect(target).toHaveCSS('font-style', 'italic')
  await expect(target).toHaveCSS('font-weight', '400')
})

test('values-only freezes a formula result when its source inputs later change', async ({
  page,
}) => {
  const source = await select(page, 'G2', '1:6')
  const original = await source.textContent()
  await copy(page)
  await select(page, 'E2', '1:4')
  await page.getByRole('button', { name: 'Clear contents', exact: true }).click()
  await expect(await select(page, 'G2', '1:6')).toHaveText('0')
  const target = await select(page, 'B4', '3:1')
  await paste(page, 'Paste values only')
  await expect(target).toHaveText(original ?? '')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(original ?? '')
})

test('formatting-only copies source style but leaves the destination formula intact', async ({
  page,
}) => {
  await select(page, 'P3', '2:15')
  await copy(page)
  const target = await select(page, 'G9', '8:6')
  await paste(page, 'Paste formatting only')
  await expect(target).toHaveText('$2,632')
  await expect(target).toHaveCSS('font-weight', '700')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E9*F9')
  await select(page, 'A1', '0:0')
  await expect(await select(page, 'G9', '8:6')).toHaveCSS('font-weight', '700')
})

test('normal paste tiles a rectangular selection including source formatting', async ({ page }) => {
  await select(page, 'A2:C2', '1:0')
  const customer = await page.locator('td[data-cell="1:1"]').textContent()
  await copy(page)
  await select(page, 'A10:F11', '9:0')
  await paste(page)
  for (const [address, coord] of [
    ['A10', '9:0'],
    ['D10', '9:3'],
    ['A11', '10:0'],
    ['D11', '10:3'],
  ]) {
    const cell = await select(page, address!, coord!)
    await expect(cell).toHaveText('SO-10001')
    await expect(cell).toHaveCSS('font-weight', '700')
  }
  await expect(await select(page, 'E11', '10:4')).toHaveText(customer ?? '')
  await expect(page.locator('td[data-cell="10:4"]')).toHaveCSS('font-style', 'italic')
})

test('tiling independently shifts each pasted formula through Rust', async ({ page }) => {
  const expected = await (await select(page, 'G2', '1:6')).textContent()
  await select(page, 'E2:G2', '1:4')
  await copy(page)
  await select(page, 'E10:J11', '9:4')
  await paste(page)
  const formula = await select(page, 'J11', '10:9')
  await expect(formula).toHaveText(expected ?? '')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=(H11*I11)')
})

test('non-multiple selection and cut-special reject without changing cells', async ({ page }) => {
  await select(page, 'A2:B2', '1:0')
  await copy(page)
  const target = await select(page, 'A3:C3', '2:0')
  const before = await target.textContent()
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText('whole copies')
  await expect(target).toHaveText(before ?? '')
  await select(page, 'A2', '1:0')
  await page.getByRole('button', { name: 'Cut', exact: true }).click()
  await expect(page.getByLabel('Clipboard status')).toContainText('ready to move')
  await select(page, 'A3', '2:0')
  await page.getByRole('button', { name: 'Paste values only', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText('requires Copy')
  await expect(await select(page, 'A2', '1:0')).toHaveText('SO-10001')
  await select(page, 'A3', '2:0')
  await paste(page)
  await expect(await select(page, 'A2', '1:0')).toHaveText('')
})

test('external plain text can paste values but cannot pretend to have source formatting', async ({
  page,
}) => {
  await page.evaluate(() => navigator.clipboard.writeText('=SUM('))
  const target = await select(page, 'A3', '2:0')
  await paste(page, 'Paste values only')
  await expect(target).toHaveText('=SUM(')
  await page.getByRole('button', { name: 'Paste formatting only', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText(
    'no workbook formatting',
  )
  await expect(target).toHaveText('=SUM(')
})

test('paste-special controls remain usable on desktop and narrow screens', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await select(page, 'P3', '2:15')
  await copy(page)
  const target = await select(page, 'B3', '2:1')
  await paste(page, 'Paste values only')
  await expect(target).toHaveText('125.02')
  await page.screenshot({ path: info.outputPath('paste-special-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('button', { name: 'Paste formatting only', exact: true })
    .scrollIntoViewIfNeeded()
  await paste(page, 'Paste formatting only')
  await expect(target).toHaveCSS('font-weight', '700')
  await expect(target).toHaveText('$125')
  await page.screenshot({ path: info.outputPath('paste-special-narrow.png') })
  expect(errors).toEqual([])
})
