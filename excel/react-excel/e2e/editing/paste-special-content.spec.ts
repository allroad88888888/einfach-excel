import { expect, test, type Page } from '@playwright/test'
import { select, copy } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const modes = [
  { mode: 'all', value: 'Acme Co.', fontStyle: 'italic' },
  { mode: 'values', value: 'Acme Co.', fontStyle: 'normal' },
  { mode: 'formats', value: 'Northwind', fontStyle: 'italic' },
] as const

// 同名工具栏按钮不能替代弹窗选项入口；三种模式各自验证取值与格式归属。
for (const width of [1280, 390]) for (const { mode, value, fontStyle } of modes)
  test(`${mode} content in paste special has native scope and one undo at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 850 })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B2', '1:1')
    await copy(page)
    await select(page, 'B3', '2:1')
    await expect(cell(page, '2:1')).toHaveText('Northwind')
    await expect(cell(page, '2:1')).toHaveCSS('font-style', 'normal')
    const opener = page.getByRole('button', { name: 'Paste special', exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Paste special', exact: true })
    const content = dialog.getByRole('combobox', { name: 'Paste content', exact: true })
    if (mode === 'all') await content.selectOption('values')
    await content.selectOption(mode)
    await expect(content).toHaveValue(mode)
    await expect(dialog.getByRole('combobox', { name: 'Operation', exact: true })).toHaveValue('none')
    await dialog.getByRole('button', { name: 'Apply paste', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    await expect(page.getByLabel('Clipboard status')).toHaveText('Pasted cells.')
    await expect(cell(page, '2:1')).toHaveText(value)
    await expect(cell(page, '2:1')).toHaveCSS('font-style', fontStyle)
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await expect(cell(page, '2:2')).toHaveText('East')
    await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '2:1')).toHaveText('Northwind')
    await expect(cell(page, '2:1')).toHaveCSS('font-style', 'normal')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, '2:1')).toHaveText(value)
    await expect(cell(page, '2:1')).toHaveCSS('font-style', fontStyle)
    await select(page, 'B3', '2:1')
    await expect(page.getByRole('textbox', { name: 'Active cell value', exact: true })).toHaveValue(value)
  })
