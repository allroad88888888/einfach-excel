import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

// 工作表导航及重命名按钮的独立 DOM 入口，不用 Core 命令代替点击。
for (const width of [1280, 390]) test.describe(`${width}px sheet entries`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B2', '1:1')
  })

  // 窄屏 CSS 刻意隐藏前后导航；标签切表另有独立验收，不把不存在的入口计为通过。
  for (const direction of width > 760 ? ['Previous', 'Next'] as const : [])
    test(`${direction} sheet button switches the native sheet without history at ${width}px`, async ({ page }) => {
      if (direction === 'Previous') {
        await page.getByRole('tab', { name: 'Summary', exact: true }).click()
        await select(page, 'B2', '1:1')
      }
      await page.getByRole('button', { name: `${direction} sheet`, exact: true }).click()
      const target = direction === 'Previous' ? 'Sales Orders' : 'Summary'
      await expect(page.getByRole('tab', { name: target, exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('aria-label', `${target} cells`)
      await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
      await expect(page.getByRole('button', { name: `${direction} sheet`, exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      if (direction === 'Next') {
        await expect(cell(page, '0:0')).toHaveText('First order total')
        await expect(cell(page, '0:1')).toHaveText('79')
        await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
      }
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B2')
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
      await select(page, 'A2', '1:0')
      await expect(cell(page, '1:0')).toHaveText('SO-10001')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await expect(page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab'))
        .toHaveText(['Sales Orders', 'Summary'])
    })

  test(`rename button opens a selected native name without mutation at ${width}px`, async ({ page }) => {
    await page.getByRole('button', { name: 'Rename sheet', exact: true }).click()
    const input = page.getByRole('textbox', { name: 'Sheet name', exact: true })
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('Sales Orders')
    expect(await input.evaluate(node => {
      const field = node as HTMLInputElement
      return [field.selectionStart, field.selectionEnd]
    })).toEqual([0, 12])
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(input).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B2')
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    await expect(page.getByRole('tab', { name: 'Sales Orders', exact: true })).toHaveAttribute('aria-selected', 'true')
  })
})
