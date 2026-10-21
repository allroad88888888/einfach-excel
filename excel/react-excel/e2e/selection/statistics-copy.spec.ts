import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const values = [{ label: 'Count', value: '6' }, { label: 'Numerical count', value: '4' },
  { label: 'Average', value: '6.5' }, { label: 'Min', value: '-4' }, { label: 'Max', value: '20' }]
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A93:F93', '92:0')
  await expect(page.getByRole('status', { name: 'Selection statistics' })).toContainText('Sum: 26')
})

for (const { label, value } of values) for (const width of [1280, 390])
  test(`copy ${label} statistic writes its native scalar and pastes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.evaluate(() => navigator.clipboard.writeText('Not the statistic'))
    const statistic = page.getByRole('status', { name: 'Selection statistics' })
      .getByRole('button', { name: `Copy ${label}`, exact: true })
    await expect(statistic).toHaveText(`${label}: ${value}`)
    await statistic.click()
    await expect(page.getByLabel('Statistic copy status')).toHaveText(`Copied ${label}.`)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value)
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A93:F93')
    await select(page, 'H94', '93:7')
    await page.getByRole('button', { name: 'Paste', exact: true }).click()
    await expect(cell(page, '93:7')).toHaveText(value)
    await expect(cell(page, '92:0')).toHaveText('10')
    await expect(cell(page, '92:0')).toHaveCSS('font-style', 'italic')
    await expect(cell(page, '92:2')).toHaveText('-4')
    await expect(cell(page, '92:2')).toHaveCSS('font-weight', '700')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '93:7')).toHaveText('')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, '93:7')).toHaveText(value)
  })
