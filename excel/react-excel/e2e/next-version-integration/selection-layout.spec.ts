import { expect, test } from '@playwright/test'
import { cell, expectSelected, openOrders } from '../multi-range-selection/pointer'

for (const width of [1280, 390]) {
  test(`manual multi-area selection status is readable in Chinese at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await openOrders(page, width)
    await page.getByRole('combobox', { name: 'Interface language', exact: true }).selectOption('zh')
    await cell(page, 2, 0).click()
    await cell(page, 5, 0).click({ modifiers: ['Meta'] })
    await expectSelected(page, 2, 0)
    await expectSelected(page, 5, 0)
    await expectSelected(page, 3, 0, false)
    const status = page.getByRole('status', { name: '多区域选区', exact: true })
    await expect(status).toContainText('已在多个区域选中 2 个单元格')
    await expect(status).toContainText('清除和格式操作应用于所有区域')
    await expect(status).toBeInViewport({ ratio: 1 })
    expect(await status.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`multi-range-zh-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(status).toHaveCount(0)
    await expect(page.locator('td[data-selected="true"]')).toHaveCount(1)
    await expect(cell(page, 5, 0)).toHaveText('SO-10005')
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
    expect(errors).toEqual([])
  })
}
