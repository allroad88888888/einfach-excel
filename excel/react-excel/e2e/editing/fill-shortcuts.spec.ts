import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const shortcuts = [
  { key: 'Control+d', direction: 'down' },
  { key: 'Meta+d', direction: 'down' },
  { key: 'Control+r', direction: 'right' },
  { key: 'Meta+r', direction: 'right' },
] as const

for (const width of [1280, 390]) for (const { key, direction } of shortcuts)
  test(`${key} fills ${direction} through the focused grid with one undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const down = direction === 'down'
    await select(page, down ? 'B71:B73' : 'D71:F71', down ? '70:1' : '70:3')
    await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
    await page.keyboard.press(key)
    await expect(page.getByLabel('Fill status')).toHaveText(`Filled ${direction}.`)
    const target = cell(page, down ? '72:1' : '70:5')
    await expect(target).toHaveText(down ? '6' : 'Fill me')
    await expect(cell(page, down ? '71:1' : '70:4')).toHaveText(down ? '5' : 'Fill me')
    await expect(target).toHaveCSS(down ? 'font-weight' : 'text-decoration-line', down ? '700' : 'underline')
    await expect(cell(page, '70:0')).toHaveText('2')
    await expect(cell(page, down ? '70:3' : '70:1')).toHaveText(down ? 'Fill me' : '4')
    await select(page, down ? 'B73' : 'F71', down ? '72:1' : '70:5')
    await expect(page.getByRole('textbox', { name: 'Active cell value', exact: true }))
      .toHaveValue(down ? '=(A73+$A$71)' : 'Fill me')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(target).toHaveText('')
    await expect(cell(page, down ? '70:1' : '70:3')).toHaveText(down ? '4' : 'Fill me')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(target).toHaveText(down ? '6' : 'Fill me')
  })
