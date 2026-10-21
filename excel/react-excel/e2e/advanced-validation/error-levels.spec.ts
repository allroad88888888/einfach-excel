import { expect, test } from '@playwright/test'
import { bar, button, cell, configure, edit, start } from './support'

for (const width of [1280, 390]) for (const style of ['warning', 'information'] as const)
  test.describe(`${style} at ${width}px`, () => {
    test.use({ viewport: { width, height: 850 } })
    test.beforeEach(async ({ page }) => { await start(page); await configure(page, { style }) })

    test(`continue ${style} submits the native draft exactly once at ${width}px`, async ({ page }, info) => {
      await edit(page, 'D45', '44:3', '-1')
      const dialog = page.getByRole('dialog', { name: 'Check quantity', exact: true })
      await expect(dialog).toContainText('Enter a positive quantity.')
      await expect(cell(page, '44:3')).toHaveText('')
      await expect(bar(page)).toHaveValue('-1')
      await page.screenshot({ path: info.outputPath(`validation-${style}-${width}.png`) })
      await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(cell(page, '44:3')).toHaveText('-1')
      await expect(cell(page, '45:3')).toHaveText('')
      await button(page, 'Undo').click(); await expect(cell(page, '44:3')).toHaveText('')
      await button(page, 'Redo').click(); await expect(cell(page, '44:3')).toHaveText('-1')
      await button(page, 'Undo').click(); await button(page, 'Undo').click()
      await expect(button(page, 'Undo')).toBeDisabled()
    })

    test(`cancel ${style} keeps the draft without changing values or history at ${width}px`, async ({ page }) => {
      await edit(page, 'D45', '44:3', '-1')
      const dialog = page.getByRole('dialog', { name: 'Check quantity', exact: true })
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(bar(page)).toHaveValue('-1')
      await expect(cell(page, '44:3')).toHaveText('')
      await bar(page).fill('2'); await bar(page).press('Enter')
      await expect(cell(page, '44:3')).toHaveText('2')
      await button(page, 'Undo').click(); await expect(cell(page, '44:3')).toHaveText('')
      await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
      await expect(cell(page, '45:3')).toHaveText('')
    })
  })
