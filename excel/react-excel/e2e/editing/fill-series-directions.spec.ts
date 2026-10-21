import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

for (const width of [1280, 390]) for (const direction of ['down', 'right'])
  test(`series direction ${direction} uses its actual dropdown and one undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    if (direction === 'down') await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, direction === 'down' ? 'A40:A44' : 'E4:H4', direction === 'down' ? '39:0' : '3:4')
    await page.getByRole('button', { name: 'Fill series', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Fill series', exact: true })
    const menu = dialog.getByRole('combobox', { name: 'Direction', exact: true })
    await menu.selectOption(direction === 'down' ? 'right' : 'down')
    await menu.selectOption(direction)
    await dialog.getByRole('button', { name: 'Apply series', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const targets = direction === 'down'
      ? [['39:0', '1', '1'], ['40:0', '3', '3'], ['41:0', '5', ''], ['43:0', '9', '']]
      : [['3:4', '3', '3'], ['3:5', '149', '149'], ['3:6', '295', '447'], ['3:7', '441', 'TRUE']]
    for (const [coord, value] of targets) await expect(cell(page, coord!)).toHaveText(value!)
    const neighbor = cell(page, direction === 'down' ? '39:2' : '4:4')
    await expect(neighbor).toHaveText(direction === 'down' ? 'Item001' : '4')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    for (const [coord, , original] of targets)
      await expect(cell(page, coord!)).toHaveText(original!)
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    if (direction === 'down') await expect(neighbor).toHaveCSS('font-style', 'italic')
    else {
      await select(page, 'G4', '3:6')
      await expect(page.getByRole('textbox', { name: 'Active cell value', exact: true }))
        .toHaveValue('=E4*F4')
    }
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    for (const [coord, value] of targets) await expect(cell(page, coord!)).toHaveText(value!)
  })
