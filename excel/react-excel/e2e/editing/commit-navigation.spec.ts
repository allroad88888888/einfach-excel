import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const moves = [
  { key: 'Enter', address: 'E3', coord: '2:4', value: '2' },
  { key: 'Shift+Enter', address: 'E1', coord: '0:4', value: 'Quantity' },
  { key: 'Tab', address: 'F2', coord: '1:5', value: '79' },
  { key: 'Shift+Tab', address: 'D2', coord: '1:3', value: 'Keyboard' },
]

for (const width of [1280, 390]) test.describe(`${width}px native commit navigation`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
  })

  for (const { key, address, coord, value } of moves)
    test(`editor ${key} commits once before moving to ${address} at ${width}px`, async ({ page }) => {
      await page.locator('[data-workbook-grid]').press('F2')
      const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
      await editor.fill('3')
      await page.keyboard.press(key)
      await expect(editor).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(address)
      await expect(cell(page, coord)).toHaveAttribute('data-selected', 'true')
      await expect(cell(page, coord)).toHaveText(value)
      await expect(cell(page, coord)).toBeInViewport({ ratio: 1 })
      await expect(page.locator('[data-workbook-grid]')).toBeFocused()
      await select(page, 'E2', '1:4')
      await expect(cell(page, '1:4')).toHaveText('3')
      await expect(cell(page, '1:4')).toHaveCSS('color', 'rgb(192, 0, 0)')
      await select(page, 'G2', '1:6')
      await expect(cell(page, '1:6')).toHaveText('237')
      await expect(page.getByRole('textbox', { name: 'Active cell value', exact: true }))
        .toHaveValue('=E2*F2')
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(cell(page, '1:6')).toHaveText('79')
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Redo', exact: true }).click()
      await expect(cell(page, '1:6')).toHaveText('237')
      await select(page, 'E2', '1:4')
      await expect(cell(page, '1:4')).toHaveText('3')
      await expect(cell(page, '1:5')).toHaveText('79')
      await select(page, 'A2', '1:0')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    })
})
