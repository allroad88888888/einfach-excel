import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { bar, button, cell, configure, edit, start, validationDialog } from './support'

for (const width of [1280, 390]) test.describe(`${width}px custom input boundaries`, () => {
  test.use({ viewport: { width, height: 850 } })
  test.beforeEach(async ({ page }) => { await start(page) })

  test(`custom formula blank policy uses the actual native candidate at ${width}px`, async ({ page }) => {
    await configure(page, { formula: '=LEN(D45)>0' })
    await edit(page, 'D45', '44:3', 'kept'); await expect(cell(page, '44:3')).toHaveText('kept')
    await select(page, 'D45', '44:3'); await button(page, 'Data validation').click()
    await page.getByLabel('Ignore blank cells', { exact: true }).uncheck()
    await button(page, 'Apply').click()
    await expect(validationDialog(page)).toHaveCount(0)
    await expect(bar(page)).toBeEnabled()
    await expect(bar(page)).toHaveValue('kept')
    await expect(page.locator('[data-workbook-grid="true"]')).toHaveAttribute('data-projection-retained', 'false')
    await bar(page).fill(''); await expect(bar(page)).toHaveValue(''); await bar(page).press('Enter')
    await expect(cell(page, '44:3')).toHaveText('kept')
    await expect(page.getByText('Enter a positive quantity.', { exact: true })).toBeVisible()
    await bar(page).press('Escape'); await button(page, 'Undo').click()
    await expect(button(page, 'Redo')).toBeEnabled()
    await bar(page).fill(''); await expect(bar(page)).toHaveValue(''); await bar(page).press('Enter')
    await expect(cell(page, '44:3')).toHaveText(''); await expect(cell(page, '45:3')).toHaveText('')
  })

  test(`custom validation rolls back rejected array input and its spill neighbors at ${width}px`, async ({ page }) => {
    await configure(page)
    await edit(page, 'D45', '44:3', '=SEQUENCE(2,1,-1)')
    await expect(page.getByText('Enter a positive quantity.', { exact: true })).toBeVisible()
    await expect(cell(page, '44:3')).toHaveText(''); await expect(cell(page, '45:3')).toHaveText('')
    await expect(bar(page)).toHaveValue('=SEQUENCE(2,1,-1)')
    await bar(page).press('Escape'); await button(page, 'Undo').click()
    await expect(button(page, 'Undo')).toBeDisabled()
  })

  test(`custom validation follows cross sheet dependency changes at ${width}px`, async ({ page }) => {
    await configure(page, { formula: "=AND(D45>0,'Sales Orders'!$E$2>0)" })
    await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
    await edit(page, 'E2', '1:4', '-1'); await expect(cell(page, '1:4')).toHaveText('-1')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await edit(page, 'D45', '44:3', '2')
    await expect(page.getByText('Enter a positive quantity.', { exact: true })).toBeVisible()
    await expect(cell(page, '44:3')).toHaveText(''); await bar(page).press('Escape')
    await button(page, 'Undo').click()
    await edit(page, 'D45', '44:3', '2'); await expect(cell(page, '44:3')).toHaveText('2')
    await expect(cell(page, '45:3')).toHaveText('')
  })
})
