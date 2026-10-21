import { expect, test } from '@playwright/test'
import { button, cell, panel, select, openProtection, closeProtection, input } from './support'

for (const width of [1280, 390])
  test(`native protection seed remains open with configured editable ranges and no startup history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'A71', '70:0')
    await expect(cell(page, '70:0')).toHaveText('2')
    await expect(button(page, 'Undo')).toBeDisabled()
    await openProtection(page)
    await expect(panel(page)).toContainText('This worksheet is open for editing.')
    await expect(button(page, 'Remove editable range A71:A73')).toBeEnabled()
    await expect(button(page, 'Protect worksheet')).toBeEnabled()
    await closeProtection(page)
    // A configured range does not lock the other cells until the user protects the sheet.
    await select(page, 'B71', '70:1'); await input(page, '8')
    await expect(cell(page, '70:1')).toHaveText('8')
    await expect(cell(page, '70:0')).toHaveText('2')
    await button(page, 'Undo').click()
    await expect(cell(page, '70:1')).toHaveText('4')
    await expect(button(page, 'Undo')).toBeDisabled()
    await openProtection(page)
    await expect(button(page, 'Remove editable range A71:A73')).toBeEnabled()
    await expect(panel(page)).toContainText('This worksheet is open for editing.')
  })
