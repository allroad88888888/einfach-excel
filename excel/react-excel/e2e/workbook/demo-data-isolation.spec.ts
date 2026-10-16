import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

for (const width of [1280, 390]) {
  test(`original merge demo survives ordinary test data at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await select(page, 'A21', '20:0')
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A21:C21')
    const merge = page.locator('[data-merged-cell][data-cell="20:0"]')
    await expect(merge).toContainText('#01 横向合并')
    await expect(merge).toHaveAttribute('aria-colspan', '3')
    await expect(page.getByRole('link', { name: 'Sales Orders', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`original-merge-${width}.png`) })

    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await select(page, 'A401:C401', '400:0')
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A401:C401')
    await expect(page.locator('td[data-cell="400:0"]')).toHaveText('SO-10400')
    await expect(page.locator('td[data-cell="400:2"]')).toHaveText('West')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.screenshot({ path: info.outputPath(`plain-fixture-${width}.png`) })

    await page.goto('/?demo=sales-orders')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await select(page, 'A21', '20:0')
    await expect(merge).toContainText('#01 横向合并')
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A21:C21')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
