import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const entries = [
  { action: 'palette', color: '#8e7cc3', css: 'rgb(142, 124, 195)' },
  { action: 'Hex', color: '#123abc', css: 'rgb(18, 58, 188)' },
  { action: 'native color', color: '#a61c00', css: 'rgb(166, 28, 0)' },
]
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'B2', '1:1')
})

for (const { action, color, css } of entries) for (const width of [1280, 390])
  test(`border ${action} color commits one native edge and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const before = await cell(page, '1:1').evaluate((node) => getComputedStyle(node).borderBottomColor)
    const neighbor = await cell(page, '1:3').evaluate((node) => getComputedStyle(node).borderBottomColor)
    await button(page, 'Border settings').click()
    await page.getByLabel('Position', { exact: true }).selectOption('bottom')
    await page.getByLabel('Line style', { exact: true }).selectOption('thin')
    if (action === 'palette') await button(page, `Border color ${color}`).click()
    else if (action === 'Hex') await page.getByLabel('Hex color', { exact: true }).fill(color)
    else await page.getByLabel('Choose custom border color', { exact: true }).fill(color)
    await expect(page.getByLabel('Hex color', { exact: true })).toHaveValue(color)
    await button(page, 'Apply borders').click()
    await expect(page.getByRole('dialog', { name: 'Borders', exact: true })).toHaveCount(0)
    await expect(cell(page, '1:1')).toHaveCSS('border-bottom-color', css)
    await expect(cell(page, '1:1')).toHaveCSS('border-bottom-width', '1px')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(cell(page, '1:3')).toHaveCSS('border-bottom-color', neighbor)
    await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    await button(page, 'Undo').click()
    await expect(cell(page, '1:1')).toHaveCSS('border-bottom-color', before)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(cell(page, '1:1')).toHaveCSS('border-bottom-color', css)
    await button(page, 'Border settings').click()
    await expect(page.getByLabel('Hex color', { exact: true })).toHaveValue(color)
    await button(page, 'Cancel').click()
  })
