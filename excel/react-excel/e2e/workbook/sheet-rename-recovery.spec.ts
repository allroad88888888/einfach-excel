import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })

// 重命名草稿的退出与原生校验恢复，不允许失败操作截断已有重做分支。
for (const width of [1280, 390]) test.describe(`${width}px rename recovery`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'H2', '1:7')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await bar.fill('Keep rename redo')
    await bar.press('Enter')
    await expect(cell(page, '1:7')).toHaveText('Keep rename redo')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await select(page, 'B2', '1:1')
    await page.getByRole('button', { name: 'Rename sheet', exact: true }).click()
  })

  for (const cancel of ['Cancel', 'Escape'] as const)
    test(`${cancel} discards a sheet name draft and retains redo at ${width}px`, async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Sheet name', exact: true })
      await input.fill('Discarded name')
      if (cancel === 'Escape') await input.press('Escape')
      else await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(input).toHaveCount(0)
      await expect(tab(page, 'Sales Orders')).toHaveAttribute('aria-selected', 'true')
      await expect(tab(page, 'Discarded name')).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B2')
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Rename sheet', exact: true }).click()
      await expect(input).toHaveValue('Sales Orders')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByRole('button', { name: 'Redo', exact: true }).click()
      await select(page, 'H2', '1:7')
      await expect(cell(page, '1:7')).toHaveText('Keep rename redo')
      await select(page, 'A2', '1:0')
      await expect(cell(page, '1:0')).toHaveText('SO-10001')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    })

  for (const [reason, invalid, error] of [
    ['duplicate', 'summary', 'already exists'],
    ['invalid characters', 'bad/name', 'cannot contain'],
    ['empty', '', '1 to 31'],
    ['too long', '12345678901234567890123456789012', '1 to 31'],
    ['reserved', 'History', 'reserved'],
  ] as const)
    test(`${reason} sheet name can correct without partial rename at ${width}px`, async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Sheet name', exact: true })
      await input.fill(invalid)
      await input.press('Enter')
      await expect(input).toHaveValue(invalid)
      await expect(input).toBeFocused()
      await expect(input).toHaveAttribute('aria-invalid', 'true')
      await expect(page.locator('#sheet-command-error')).toContainText(error)
      await expect(tab(page, 'Sales Orders')).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab'))
        .toHaveText(['Sales Orders', 'Summary'])
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled()
      await input.fill('Retry Orders')
      await expect(input).toHaveAttribute('aria-invalid', 'false')
      await input.press('Enter')
      await expect(input).toHaveCount(0)
      await expect(tab(page, 'Retry Orders')).toHaveAttribute('aria-selected', 'true')
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(tab(page, 'Sales Orders')).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Redo', exact: true }).click()
      await expect(tab(page, 'Retry Orders')).toHaveAttribute('aria-selected', 'true')
      await select(page, 'A2', '1:0')
      await expect(cell(page, '1:0')).toHaveText('SO-10001')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await page.getByRole('tab', { name: 'Summary', exact: true }).click()
      await select(page, 'B1', '0:1')
      await expect(cell(page, '0:1')).toHaveText('79')
      await expect(page.getByRole('textbox', { name: 'Active cell value', exact: true }))
        .toHaveValue("='Retry Orders'!G2")
    })
})
