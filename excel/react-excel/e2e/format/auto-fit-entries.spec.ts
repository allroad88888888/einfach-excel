import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

// 只验收列宽自动适应的键盘入口，内容测量仍由真实 DOM 与 Rust 尺寸命令协作完成。
for (const width of [1280, 390])
  test(`Enter fits a column to styled offscreen content with one undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'E2', '1:4')
    const handle = page.getByRole('separator', { name: 'Resize column E', exact: true })
    await expect(handle).toHaveAttribute('aria-valuenow', '120')
    await expect(page.locator('td[data-cell="89:4"]')).toHaveCount(0)
    await handle.press('Enter')
    await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(250)
    const fitted = (await handle.getAttribute('aria-valuenow'))!
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('separator', { name: 'Resize column F', exact: true }))
      .toHaveAttribute('aria-valuenow', '120')
    await select(page, 'E90', '89:4')
    const cell = page.locator('td[data-cell="89:4"]')
    await expect(cell).toHaveText('Offscreen customer — Northwind International')
    await expect(cell).toHaveCSS('font-weight', '700')
    await expect(cell).toHaveCSS('font-size', '14px')
    expect(await cell.locator('.cell-content').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(handle).toHaveAttribute('aria-valuenow', '120')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(handle).toHaveAttribute('aria-valuenow', fitted)
    await expect(cell).toHaveText('Offscreen customer — Northwind International')
  })
