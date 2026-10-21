import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

// 重命名的标签手势及 Save 提交入口；跨表引用与历史均由原生工作簿返回。
for (const width of [1280, 390]) test.describe(`${width}px rename entries`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B2', '1:1')
  })

  for (const entry of ['double click', 'F2'] as const)
    test(`${entry} opens sheet rename without mutation at ${width}px`, async ({ page }) => {
      const tab = page.getByRole('tab', { name: 'Sales Orders', exact: true })
      if (entry === 'double click') await tab.dblclick()
      else await tab.press('F2')
      const input = page.getByRole('textbox', { name: 'Sheet name', exact: true })
      await expect(input).toHaveValue('Sales Orders')
      await expect(input).toBeFocused()
      expect(await input.evaluate(node => {
        const field = node as HTMLInputElement
        return [field.selectionStart, field.selectionEnd]
      })).toEqual([0, 12])
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(input).toHaveCount(0)
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B2')
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    })

  test(`Save sheet name rewrites references and undoes once at ${width}px`, async ({ page }) => {
    await page.getByRole('button', { name: 'Rename sheet', exact: true }).click()
    const input = page.getByRole('textbox', { name: 'Sheet name', exact: true })
    await input.fill("Budget O'Brien")
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(input).toHaveCount(0)
    const renamed = page.getByRole('tab', { name: "Budget O'Brien", exact: true })
    await expect(renamed).toHaveAttribute('aria-selected', 'true')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'B1', '0:1')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await expect(cell(page, '0:1')).toHaveText('79')
    await expect(bar).toHaveValue("='Budget O''Brien'!G2")
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(renamed).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Sales Orders', exact: true })).toBeVisible()
    await expect(bar).toHaveValue("='Sales Orders'!G2")
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(renamed).toBeVisible()
    await expect(bar).toHaveValue("='Budget O''Brien'!G2")
    await renamed.click()
    await select(page, 'E2', '1:4')
    await bar.fill('3')
    await bar.press('Enter')
    await expect(cell(page, '1:4')).toHaveText('3')
    await select(page, 'A2', '1:0')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'B1', '0:1')
    await expect(cell(page, '0:1')).toHaveText('237')
    await expect(bar).toHaveValue("='Budget O''Brien'!G2")
  })
})
