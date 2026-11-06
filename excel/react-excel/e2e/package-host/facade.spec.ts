import { expect, test } from '@playwright/test'
import { cell, start } from './support'

for (const bundler of ['vite', 'rspack']) {
  test(`installed ${bundler} host facade formats a cell without touching its sibling`, async ({ page }) => {
    const errors = await start(page, bundler)
    await page.getByRole('button', { name: 'Host format A1', exact: true }).click()
    const result = page.getByLabel('Installed API result')
    await expect(result).toContainText('"status":"ok"')
    await expect(result).not.toContainText('displayError')
    await expect(cell(page, '0:0')).toHaveCSS('font-weight', '700')
    await expect(page.locator('#second td[data-cell="0:0"]')).toHaveCSS('font-weight', '400')
    expect(errors).toEqual([])
  })
}
