import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

for (const width of [1280, 390]) test.describe(`${width}px formula bar write semantics`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
  })

  for (const key of ['Enter', 'Escape'] as const)
    test(`formula bar ${key} keeps the source selected with correct native history at ${width}px`, async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
      const undo = page.getByRole('button', { name: 'Undo', exact: true })
      const redo = page.getByRole('button', { name: 'Redo', exact: true })
      if (key === 'Escape') {
        await input.fill('3')
        await input.press('Enter')
        await expect(cell(page, '1:4')).toHaveText('3')
        await undo.click()
        await expect(cell(page, '1:4')).toHaveText('1')
      }
      await input.fill(key === 'Enter' ? '3' : 'Discarded')
      await expect(input).toBeFocused()
      await expect(cell(page, '1:4')).toHaveText('1')
      await expect(undo).toBeDisabled()
      await page.keyboard.press(key)
      await expect(input).toHaveValue(key === 'Enter' ? '3' : '1')
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('E2')
      await expect(cell(page, '1:4')).toHaveText(key === 'Enter' ? '3' : '1')
      await expect(cell(page, '1:4')).toHaveCSS('color', 'rgb(192, 0, 0)')
      await expect(page.locator('[data-workbook-grid]')).toBeFocused()
      await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
      await select(page, 'G2', '1:6')
      await expect(cell(page, '1:6')).toHaveText(key === 'Enter' ? '237' : '79')
      await expect(input).toHaveValue('=E2*F2')
      if (key === 'Enter') {
        await undo.click()
        await expect(cell(page, '1:6')).toHaveText('79')
      }
      await expect(undo).toBeDisabled()
      await expect(redo).toBeEnabled()
      await redo.click()
      await expect(cell(page, '1:6')).toHaveText('237')
      await select(page, 'A2', '1:0')
      await expect(cell(page, '1:0')).toHaveText('SO-10001')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    })
})
