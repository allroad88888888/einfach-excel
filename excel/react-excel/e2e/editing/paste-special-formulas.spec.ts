import { expect, test, type Page } from '@playwright/test'
import { select, copy } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const modes = [
  { mode: 'values-formats', value: '2,632.00', raw: '2632', live: false, keepFont: false },
  { mode: 'formulas', value: '79', raw: '=(E2*F2)', live: true, keepFont: true },
  { mode: 'formulas-number-formats', value: '79.00', raw: '=(E2*F2)', live: true, keepFont: true },
  { mode: 'values-number-formats', value: '2,632.00', raw: '2632', live: false, keepFont: true },
] as const

// 弹窗公式类模式必须区分快照值、相对引用、数字格式和字体，不能只断言显示文本。
for (const width of [1280, 390]) for (const option of modes)
  test(`${option.mode} paste special preserves formula semantics with one undo at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 850 })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'G2', '1:6')
    const target = cell(page, '1:6')
    const originalFont = await target.evaluate(node => getComputedStyle(node).fontFamily)
    await expect(target).toHaveText('79')
    await select(page, 'G9', '8:6')
    await expect(cell(page, '8:6')).toHaveText('2,632.00')
    const sourceFont = await cell(page, '8:6').evaluate(node => getComputedStyle(node).fontFamily)
    await copy(page)
    await select(page, 'G2', '1:6')
    await page.getByRole('button', { name: 'Paste special', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Paste special', exact: true })
    await dialog.getByRole('combobox', { name: 'Paste content', exact: true }).selectOption(option.mode)
    await dialog.getByRole('button', { name: 'Apply paste', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(target).toHaveText(option.value)
    await expect(target).toHaveCSS('font-family', option.keepFont ? originalFont : sourceFont)
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await expect(bar).toHaveValue(option.raw)
    await expect(cell(page, '1:4')).toHaveText('1')
    await expect(cell(page, '1:4')).toHaveCSS('color', 'rgb(192, 0, 0)')
    await expect(cell(page, '1:5')).toHaveText('79')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(target).toHaveText('79')
    await expect(target).toHaveCSS('font-family', originalFont)
    await expect(bar).toHaveValue('=E2*F2')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(target).toHaveText(option.value)
    await expect(bar).toHaveValue(option.raw)
    await select(page, 'E2', '1:4')
    await bar.fill('2')
    await bar.press('Enter')
    await expect(cell(page, '1:4')).toHaveText('2')
    await select(page, 'G2', '1:6')
    const changed = option.mode === 'formulas' ? '158' : '158.00'
    await expect(target).toHaveText(option.live ? changed : option.value)
    await expect(bar).toHaveValue(option.raw)
    await select(page, 'G9', '8:6')
    await expect(cell(page, '8:6')).toHaveText('2,632.00')
  })
