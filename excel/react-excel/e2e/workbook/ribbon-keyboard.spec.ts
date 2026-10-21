import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

const movements = [
  { key: 'End', from: 'Formulas', to: 'View' },
  { key: 'ArrowRight', from: 'View', to: 'Start' },
  { key: 'ArrowLeft', from: 'Start', to: 'View' },
  { key: 'Home', from: 'Data', to: 'Start' },
]

for (const width of [1280, 390]) for (const { key, from, to } of movements)
  test(`ribbon ${key} activates and focuses exactly ${to} without losing redo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await bar.fill('2')
    await bar.press('Enter')
    await expect(cell('1:6')).toHaveText('158')
    await button('Undo').click()
    await page.getByRole('tab', { name: from, exact: true }).click()
    await page.keyboard.press(key)
    const target = page.getByRole('tab', { name: to, exact: true })
    await expect(target).toBeFocused()
    await expect(target).toHaveAttribute('aria-selected', 'true')
    await expect(target).toHaveAttribute('tabindex', '0')
    await expect(page.getByRole('tablist', { name: 'Workbook commands' })
      .getByRole('tab', { selected: true })).toHaveCount(1)
    await expect(page.getByRole('toolbar', { name: `${to} tools`, exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('E2')
    await expect(cell('1:4')).toHaveText('1')
    await expect(cell('1:4')).toHaveCSS('color', 'rgb(192, 0, 0)')
    await expect(cell('1:5')).toHaveText('79')
    await expect(cell('1:6')).toHaveText('79')
    await expect(cell('1:6')).toHaveCSS('font-family', 'Georgia')
    await expect(button('Undo')).toBeDisabled()
    await button('Redo').click()
    await expect(cell('1:4')).toHaveText('2')
    await expect(cell('1:6')).toHaveText('158')
  })
