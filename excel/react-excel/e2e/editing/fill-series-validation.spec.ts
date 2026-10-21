import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

for (const width of [1280, 390])
  test(`invalid series sample count corrects without partial native writes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'A40:A44', '39:0')
    await page.getByRole('button', { name: 'Fill series', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Fill series', exact: true })
    const count = dialog.getByRole('spinbutton', { name: 'Source sample count', exact: true })
    for (const value of ['', '1', '1.5', '5']) {
      await count.fill(value)
      await dialog.getByRole('button', { name: 'Apply series', exact: true }).click()
      await expect(dialog).toBeVisible()
      if (value === '5') await expect(dialog.getByRole('alert')).toContainText('at least one destination')
      else expect(await count.evaluate(node =>
        (node as HTMLInputElement).validity.valid)).toBe(false)
      await expect(cell(page, '39:0')).toHaveText('1')
      await expect(cell(page, '40:0')).toHaveText('3')
      await expect(cell(page, '41:0')).toHaveText('')
      await expect(cell(page, '43:0')).toHaveText('')
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    }
    await count.fill('2')
    await dialog.getByRole('button', { name: 'Apply series', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(cell(page, '41:0')).toHaveText('5')
    await expect(cell(page, '43:0')).toHaveText('9')
    await expect(cell(page, '39:2')).toHaveText('Item001')
    await expect(cell(page, '39:2')).toHaveCSS('font-style', 'italic')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '41:0')).toHaveText('')
    await expect(cell(page, '43:0')).toHaveText('')
    await expect(cell(page, '40:0')).toHaveText('3')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, '43:0')).toHaveText('9')
  })
