import { expect, test } from '@playwright/test'
import { select, copy, paste, pasteOption } from '../support/clipboard'

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

test('transposes seed data with styles then repeats using the transposed dimensions', async ({
  page,
}) => {
  await select(page, 'A2:C3', '1:0')
  const customer = await page.locator('td[data-cell="1:1"]').textContent()
  await copy(page)
  await select(page, 'A10:D15', '9:0')
  await pasteOption(page, 'transpose')
  for (const [address, coord] of [
    ['A10', '9:0'],
    ['C10', '9:2'],
    ['A13', '12:0'],
    ['C13', '12:2'],
  ]) {
    const cell = await select(page, address!, coord!)
    await expect(cell).toHaveText('SO-10001')
    await expect(cell).toHaveCSS('font-weight', '700')
  }
  await expect(await select(page, 'B10', '9:1')).toHaveText('SO-10002')
  const italic = await select(page, 'C14', '13:2')
  await expect(italic).toHaveText(customer ?? '')
  await expect(italic).toHaveCSS('font-style', 'italic')
})

test('transposes a formula using the destination offset while preserving absolute references', async ({
  page,
}) => {
  await select(page, 'F2', '1:5')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('=E2+$E$2')
  await input.press('Enter')
  await select(page, 'E2:F2', '1:4')
  await copy(page)
  await select(page, 'E10', '9:4')
  await pasteOption(page, 'transpose')
  await select(page, 'E11', '10:4')
  await expect(input).toHaveValue('=(D11+$E$2)')
  await expect(page.getByRole('button', { name: 'Paste', exact: true })).toBeEnabled()
})

test('skip blanks preserves a target formula and its style, but writes zero and false', async ({
  page,
}) => {
  const target = await select(page, 'G9', '8:6')
  await page.getByRole('button', { name: 'Italic', exact: true }).click()
  await expect(target).toHaveCSS('font-style', 'italic')
  await page.evaluate(() => navigator.clipboard.writeText('\t0\tfalse'))
  await pasteOption(page, 'skip-blanks')
  await expect(target).toHaveText('2,632.00')
  await expect(target).toHaveCSS('font-style', 'italic')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E9*F9')
  await expect(await select(page, 'H9', '8:7')).toHaveText('0')
  await expect(await select(page, 'I9', '8:8')).toHaveText(/false/i)
})

test('skip blanks uses the frozen internal input, not display text or source styles', async ({
  page,
}) => {
  await select(page, 'A2', '1:0')
  await page.getByRole('button', { name: 'Clear contents', exact: true }).click()
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('')
  await select(page, 'A2:B2', '1:0')
  const customer = await page.locator('td[data-cell="1:1"]').textContent()
  await copy(page)
  const target = await select(page, 'A10', '9:0')
  const before = await target.textContent()
  await pasteOption(page, 'skip-blanks')
  await expect(target).toHaveText(before ?? '')
  await expect(target).toHaveCSS('font-weight', '400')
  await expect(await select(page, 'B10', '9:1')).toHaveText(customer ?? '')
  await expect(page.locator('td[data-cell="9:1"]')).toHaveCSS('font-style', 'italic')
})

test('values and formatting freezes the formula result and keeps source number and font styles', async ({
  page,
}) => {
  const source = await select(page, 'G9', '8:6')
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await expect(source).toHaveCSS('font-weight', '700')
  await copy(page)
  await select(page, 'E9', '8:4')
  await page.getByRole('button', { name: 'Clear contents', exact: true }).click()
  await expect(await select(page, 'G9', '8:6')).toHaveText('0.00')
  const target = await select(page, 'B10', '9:1')
  await pasteOption(page, 'values-formats')
  await expect(target).toHaveText('2,632.00')
  await expect(target).toHaveCSS('font-weight', '700')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('2632')
  await select(page, 'A800', '799:0')
  await expect(await select(page, 'B10', '9:1')).toHaveText('2,632.00')
  await page.getByRole('button', { name: 'Clear formatting', exact: true }).click()
  await expect(target).toHaveText('2632')
})

test('transpose checks rotated boundaries, and rejected special cut keeps the source', async ({
  page,
}) => {
  await select(page, 'A2:C2', '1:0')
  await copy(page)
  const target = await select(page, 'A1000', '999:0')
  const before = await target.textContent()
  const menu = page.getByRole('combobox', { name: 'More paste options' })
  await menu.selectOption('transpose')
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText(
    'beyond the sheet',
  )
  await expect(target).toHaveText(before ?? '')
  await select(page, 'A2', '1:0')
  await copy(page, 'Cut')
  await select(page, 'A3', '2:0')
  for (const option of ['transpose', 'skip-blanks', 'values-formats']) {
    await menu.selectOption(option)
    await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText(
      'requires Copy',
    )
  }
  await expect(await select(page, 'A2', '1:0')).toHaveText('SO-10001')
  await select(page, 'A3', '2:0')
  await paste(page)
  await expect(await select(page, 'A2', '1:0')).toHaveText('')
})

test('external text can transpose but cannot supply missing source formats', async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText('11\t22\t33'))
  const target = await select(page, 'A10', '9:0')
  await pasteOption(page, 'transpose')
  await expect(await select(page, 'A12', '11:0')).toHaveText('33')
  await select(page, 'A10', '9:0')
  await page.getByRole('combobox', { name: 'More paste options' }).selectOption('values-formats')
  await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText(
    'no workbook formatting',
  )
  await expect(target).toHaveText('11')
})

test('paste options are reusable and visible on desktop and narrow viewports', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await select(page, 'P3', '2:15')
  await copy(page)
  const target = await select(page, 'B3', '2:1')
  await pasteOption(page, 'values-formats')
  await expect(target).toHaveText('$125')
  await page.getByRole('button', { name: 'Clear formatting', exact: true }).click()
  await expect(target).toHaveText('125.02')
  await pasteOption(page, 'values-formats')
  await expect(target).toHaveText('$125')
  await page.screenshot({ path: info.outputPath('paste-options-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  const menu = page.getByRole('combobox', { name: 'More paste options' })
  await menu.scrollIntoViewIfNeeded()
  await pasteOption(page, 'values-formats')
  await expect(menu).toHaveValue('')
  const box = await menu.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(28)
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  expect(
    await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return (
        document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element
      )
    }),
  ).toBe(true)
  await page.screenshot({ path: info.outputPath('paste-options-narrow.png') })
  expect(errors).toEqual([])
})
