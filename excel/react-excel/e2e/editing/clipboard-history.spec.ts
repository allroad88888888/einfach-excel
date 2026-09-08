import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste, pasteOption } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const mode of [
  'all',
  'values',
  'formats',
  'formulas',
  'values-formats',
  'formulas-number-formats',
  'values-number-formats',
]) {
  test(`${mode} paste undo restores the overwritten text and original format`, async ({ page }) => {
    await select(page, 'A2', '1:0')
    await copy(page)
    await select(page, 'A4', '3:0')
    if (mode === 'all') await paste(page)
    else if (mode === 'values') await paste(page, 'Paste values only')
    else if (mode === 'formats') await paste(page, 'Paste formatting only')
    else await pasteOption(page, mode)
    await expect(cell(page, '3:0')).toHaveText(mode === 'formats' ? '00123' : 'SO-10001')
    const weight = await cell(page, '3:0').evaluate((el) => getComputedStyle(el).fontWeight)
    await button(page, 'Undo').click()
    await expect(cell(page, '3:0')).toHaveText('00123')
    await expect(cell(page, '3:0')).toHaveCSS('font-weight', '400')
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(cell(page, '3:0')).toHaveText(mode === 'formats' ? '00123' : 'SO-10001')
    await expect(cell(page, '3:0')).toHaveCSS('font-weight', weight)
    await expect(await select(page, 'A2', '1:0')).toHaveText('SO-10001')
  })
}

test('cut undo restores source, destination and moved formula references in one step', async ({
  page,
}) => {
  await select(page, 'E2', '1:4')
  await copy(page, 'Cut')
  await select(page, 'E4', '3:4')
  await paste(page)
  await expect(cell(page, '3:4')).toHaveText('1')
  await expect(await select(page, 'E2', '1:4')).toHaveText('')
  await select(page, 'G2', '1:6')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await expect(formula).toHaveValue('=(E4*F2)')
  await button(page, 'Undo').click()
  await expect(formula).toHaveValue('=E2*F2')
  await expect(cell(page, '1:4')).toHaveText('1')
  await expect(cell(page, '1:4')).toHaveCSS('color', 'rgb(192, 0, 0)')
  await expect(cell(page, '3:4')).toHaveText('3')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(formula).toHaveValue('=(E4*F2)')
  await expect(cell(page, '1:4')).toHaveText('')
  await expect(cell(page, '3:4')).toHaveText('1')
  // 已消费的剪切不会因撤销/重做再次获准清除源格。
  await select(page, 'E5', '4:4')
  await button(page, 'Paste').click()
  await expect(page.getByLabel('Clipboard status')).toHaveText(
    'These cells have already been moved. Copy or cut again to paste.',
  )
  await expect(cell(page, '4:4')).toHaveText('4')
})

test('cut rewrites a direct cross-sheet formula and undo restores its exact source', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await select(page, 'B1', '0:1')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  const before = await formula.inputValue()
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'G2', '1:6')
  await copy(page, 'Cut')
  await select(page, 'G4', '3:6')
  await paste(page)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await select(page, 'B1', '0:1')
  await expect(formula).toHaveValue(/G4/)
  await button(page, 'Undo').click()
  await expect(formula).toHaveValue(before)
  await expect(cell(page, '0:1')).toHaveText('79')
  await button(page, 'Redo').click()
  await expect(formula).toHaveValue(/G4/)
})

test('external transposed tiled paste undoes as one operation', async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText('1\t2\n3\t4'))
  await select(page, 'A10:D13', '9:0')
  const before = await cell(page, '9:0').textContent()
  await pasteOption(page, 'transpose')
  await expect(cell(page, '9:1')).toHaveText('3')
  await expect(cell(page, '12:3')).toHaveText('4')
  await button(page, 'Undo').click()
  await expect(cell(page, '9:0')).toHaveText(before!)
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '12:3')).toHaveText('4')
})
