import { expect, test } from '@playwright/test'
import { copy, select } from '../support/clipboard'
import { button, cell, configure, edit, start } from './support'

for (const width of [1280, 390]) test.describe(`${width}px batch validation`, () => {
  test.use({ viewport: { width, height: 850 } })
  test.beforeEach(async ({ page }) => { await start(page) })

  test(`continue warning paste applies the original whole range atomically at ${width}px`, async ({ page }) => {
    await configure(page, { style: 'warning' })
    await edit(page, 'D44', '43:3', '-1'); await expect(cell(page, '43:3')).toHaveText('-1')
    await select(page, 'D44', '43:3'); await copy(page)
    await select(page, 'D45:D46', '44:3'); await button(page, 'Paste').click()
    const dialog = page.getByRole('dialog', { name: 'Check quantity', exact: true })
    await expect(dialog).toBeVisible()
    await expect(cell(page, '44:3')).toHaveText(''); await expect(cell(page, '45:3')).toHaveText('')
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(cell(page, '44:3')).toHaveText('-1'); await expect(cell(page, '45:3')).toHaveText('-1')
    await expect(cell(page, '46:3')).toHaveText('')
    await button(page, 'Undo').click()
    await expect(cell(page, '44:3')).toHaveText(''); await expect(cell(page, '45:3')).toHaveText('')
    await expect(cell(page, '43:3')).toHaveText('-1')
  })

  test(`cancel warning paste leaves every target and native undo untouched at ${width}px`, async ({ page }) => {
    await configure(page, { style: 'warning' })
    await edit(page, 'D44', '43:3', '-1'); await select(page, 'D44', '43:3'); await copy(page)
    await select(page, 'D45:D46', '44:3'); await button(page, 'Paste').click()
    await page.getByRole('dialog', { name: 'Check quantity', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(cell(page, '44:3')).toHaveText(''); await expect(cell(page, '45:3')).toHaveText('')
    await button(page, 'Undo').click(); await expect(cell(page, '43:3')).toHaveText('')
    await button(page, 'Undo').click(); await expect(button(page, 'Undo')).toBeDisabled()
  })

  test(`continue information fill accepts one whole native transaction at ${width}px`, async ({ page }) => {
    await configure(page, { style: 'information' })
    await edit(page, 'D44', '43:3', '-1')
    await select(page, 'D44:D46', '43:3')
    await page.getByRole('combobox', { name: 'Fill selected range', exact: true }).selectOption('down')
    const dialog = page.getByRole('dialog', { name: 'Check quantity', exact: true })
    await expect(dialog).toBeVisible()
    await expect(cell(page, '44:3')).toHaveText(''); await expect(cell(page, '45:3')).toHaveText('')
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(cell(page, '44:3')).toHaveText('-1'); await expect(cell(page, '45:3')).toHaveText('-1')
    await button(page, 'Undo').click()
    await expect(cell(page, '44:3')).toHaveText(''); await expect(cell(page, '45:3')).toHaveText('')
    await expect(cell(page, '43:3')).toHaveText('-1'); await expect(cell(page, '46:3')).toHaveText('')
  })
})
