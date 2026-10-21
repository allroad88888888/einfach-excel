import { expect, test, type Page } from '@playwright/test'
import { select, copy } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const operations = [
  { operation: 'none', result: '3', total: '447' },
  { operation: 'add', result: '12', total: '1788' },
  { operation: 'subtract', result: '6', total: '894' },
  { operation: 'multiply', result: '27', total: '4023' },
  { operation: 'divide', result: '3', total: '447' },
] as const

// 工具栏快捷运算不代替模态框入口；同时检查原生公式依赖和单次历史。
for (const width of [1280, 390]) for (const option of operations)
  test(`${option.operation} operation in paste special recalculates one native transaction at ${width}px`, async ({
    page, context,
  }) => {
    await page.setViewportSize({ width, height: 850 })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'E4', '3:4')
    await expect(cell(page, '3:4')).toHaveText('3')
    await copy(page)
    await select(page, 'E10', '9:4')
    const target = cell(page, '9:4')
    const originalColor = await target.evaluate(node => getComputedStyle(node).color)
    await expect(target).toHaveText('9')
    await page.getByRole('button', { name: 'Paste special', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Paste special', exact: true })
    await dialog.getByRole('combobox', { name: 'Paste content', exact: true }).selectOption('values')
    const operation = dialog.getByRole('combobox', { name: 'Operation', exact: true })
    if (option.operation === 'none') await operation.selectOption('multiply')
    await operation.selectOption(option.operation)
    await dialog.getByRole('button', { name: 'Apply paste', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(target).toHaveText(option.result)
    await expect(target).toHaveCSS('color', originalColor)
    await expect(cell(page, '9:5')).toHaveText('149')
    await expect(cell(page, '9:6')).toHaveText(option.total)
    await expect(page.getByRole('textbox', { name: 'Active cell value', exact: true })).toHaveValue(option.result)
    await expect(cell(page, '3:4')).toHaveText('3')
    await expect(cell(page, '3:6')).toHaveText('447')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(target).toHaveText('9')
    await expect(cell(page, '9:6')).toHaveText('1341')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(target).toHaveText(option.result)
    await expect(cell(page, '9:6')).toHaveText(option.total)
  })
