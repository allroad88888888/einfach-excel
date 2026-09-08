import { expect, test } from '@playwright/test'
import { select, copy, paste, pasteOption } from '../support/clipboard'

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

test('formulas only shifts references without copying source fonts or replacing target number format', async ({
  page,
}) => {
  const target = await select(page, 'G3', '2:6')
  const font = await target.evaluate((element) => getComputedStyle(element).fontFamily)
  await page.getByRole('button', { name: 'Currency format', exact: true }).click()
  await expect(target).toContainText('$')
  const display = await target.textContent()
  await select(page, 'G2', '1:6')
  await copy(page)
  await select(page, 'G3', '2:6')
  await pasteOption(page, 'formulas')
  await expect(target).toHaveText(display!)
  await expect(target).toHaveCSS('font-family', font)
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=(E3*F3)')
  await select(page, 'A800', '799:0')
  await expect(await select(page, 'G3', '2:6')).toHaveText(display!)
})

test('formulas and number formats replaces only number formatting and retains a live formula', async ({
  page,
}) => {
  const target = await select(page, 'G10', '9:6')
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await expect(target).toHaveCSS('font-weight', '700')
  await select(page, 'G9', '8:6')
  await copy(page)
  await select(page, 'G10', '9:6')
  await pasteOption(page, 'formulas-number-formats')
  await expect(target).toHaveText('1,341.00')
  await expect(target).toHaveCSS('font-weight', '700')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=(E10*F10)')
  const quantity = await select(page, 'E10', '9:4')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('10')
  await formula.press('Enter')
  await expect(quantity).toHaveText('10')
  await expect(target).toHaveText('1,490.00')
  await select(page, 'A800', '799:0')
  await expect(await select(page, 'G10', '9:6')).toHaveText('1,490.00')
})

test('values and number formats keeps precision and destination italic without source bold', async ({
  page,
}) => {
  await select(page, 'P3', '2:15')
  await copy(page)
  const target = await select(page, 'B2', '1:1')
  await pasteOption(page, 'values-number-formats')
  await expect(target).toHaveText('$125')
  await expect(target).toHaveCSS('font-style', 'italic')
  await expect(target).toHaveCSS('font-weight', '400')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('125.02')
  await page.getByRole('button', { name: 'Clear formatting', exact: true }).click()
  await expect(target).toHaveText('125.02')
})

test('values and number formats freezes formula results instead of installing shifted formulas', async ({
  page,
}) => {
  await select(page, 'G9', '8:6')
  await copy(page)
  const sourceQuantity = await select(page, 'E9', '8:4')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('1')
  await formula.press('Enter')
  await expect(sourceQuantity).toHaveText('1')
  const target = await select(page, 'B10', '9:1')
  await pasteOption(page, 'values-number-formats')
  await expect(target).toHaveText('2,632.00')
  await expect(formula).toHaveValue('2632')
})

test('formula-number-format paste tiles constants and formulas with independent reference shifts', async ({
  page,
}) => {
  await select(page, 'E9:G9', '8:4')
  await copy(page)
  await select(page, 'E10:J11', '9:4')
  await pasteOption(page, 'formulas-number-formats')
  for (const [address, coord, formula] of [
    ['G10', '9:6', '=(E10*F10)'],
    ['J11', '10:9', '=(H11*I11)'],
  ]) {
    await expect(await select(page, address!, coord!)).toHaveText('2,632.00')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(formula!)
  }
})

test('external formulas keep their references but cannot provide source number formats', async ({
  page,
}) => {
  await page.evaluate(() => navigator.clipboard.writeText('=E2*F2'))
  const target = await select(page, 'B10', '9:1')
  await pasteOption(page, 'formulas')
  await expect(target).toHaveText('79')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E2*F2')
  const menu = page.getByRole('combobox', { name: 'More paste options' })
  for (const mode of ['formulas-number-formats', 'values-number-formats']) {
    await menu.selectOption(mode)
    await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText(
      'no workbook formatting',
    )
    await expect(target).toHaveText('79')
  }
})

test('cut rejects all three modes without consuming the source snapshot', async ({ page }) => {
  await select(page, 'A2', '1:0')
  await copy(page, 'Cut')
  const target = await select(page, 'A10', '9:0')
  const menu = page.getByRole('combobox', { name: 'More paste options' })
  for (const mode of ['formulas', 'formulas-number-formats', 'values-number-formats']) {
    await menu.selectOption(mode)
    await expect(page.getByRole('alert', { name: 'Clipboard status' })).toContainText(
      'requires Copy',
    )
    await expect(await select(page, 'A2', '1:0')).toHaveText('SO-10001')
    await select(page, 'A10', '9:0')
    await expect(target).toHaveText('SO-10009')
  }
  await paste(page)
  await expect(target).toHaveText('SO-10001')
  await expect(await select(page, 'A2', '1:0')).toHaveText('')
})

test('the three options use the existing compact menu on desktop and narrow screens', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await select(page, 'P3', '2:15')
  await copy(page)
  const target = await select(page, 'B2', '1:1')
  await pasteOption(page, 'values-number-formats')
  await expect(target).toHaveText('$125')
  await page.screenshot({ path: info.outputPath('formula-paste-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  const menu = page.getByRole('combobox', { name: 'More paste options' })
  await menu.scrollIntoViewIfNeeded()
  await pasteOption(page, 'values-number-formats')
  await expect(menu).toHaveValue('')
  await expect(menu).toBeInViewport()
  expect(
    await menu.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return (
        box.width <= 140 &&
        box.left >= 0 &&
        box.right <= innerWidth &&
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element
      )
    }),
  ).toBe(true)
  await page.screenshot({ path: info.outputPath('formula-paste-narrow.png') })
  expect(errors).toEqual([])
})
