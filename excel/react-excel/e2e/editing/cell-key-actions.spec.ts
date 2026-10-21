import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

for (const width of [1280, 390]) test.describe(`${width}px editing key semantics`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
  })

  for (const key of ['Backspace', 'Delete', 'Escape'] as const)
    test(`cell ${key} preserves its distinct write and history semantics at ${width}px`, async ({ page }) => {
      const grid = page.locator('[data-workbook-grid]')
      const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
      const undo = page.getByRole('button', { name: 'Undo', exact: true })
      const redo = page.getByRole('button', { name: 'Redo', exact: true })
      if (key === 'Escape') {
        const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
        await bar.fill('3')
        await bar.press('Enter')
        await expect(cell(page, '1:4')).toHaveText('3')
        await undo.click()
        await expect(cell(page, '1:4')).toHaveText('1')
        await grid.press('F2')
        await editor.fill('Discarded')
        await editor.press('Escape')
      } else {
        await grid.press(key)
        if (key === 'Backspace') {
          await expect(editor).toBeFocused()
          await expect(editor).toHaveValue('')
          await expect(cell(page, '1:4')).toHaveText('1')
          await expect(undo).toBeDisabled()
          await editor.pressSequentially('3')
          await editor.press('Enter')
        }
      }
      await expect(editor).toHaveCount(0)
      const expected = key === 'Backspace' ? '3' : key === 'Delete' ? '' : '1'
      await expect(cell(page, '1:4')).toHaveText(expected)
      await expect(cell(page, '1:4')).toHaveCSS('color', 'rgb(192, 0, 0)')
      await expect(page.getByRole('textbox', { name: 'Name box' }))
        .toHaveValue(key === 'Backspace' ? 'E3' : 'E2')
      await expect(grid).toBeFocused()
      await select(page, 'G2', '1:6')
      await expect(cell(page, '1:6')).toHaveText(key === 'Backspace' ? '237' : key === 'Delete' ? '0' : '79')
      await expect(page.getByRole('textbox', { name: 'Active cell value', exact: true }))
        .toHaveValue('=E2*F2')
      if (key === 'Escape') {
        await expect(undo).toBeDisabled()
        await expect(redo).toBeEnabled()
        await redo.click()
        await expect(cell(page, '1:6')).toHaveText('237')
      } else {
        await undo.click()
        await expect(cell(page, '1:6')).toHaveText('79')
        await expect(undo).toBeDisabled()
        await redo.click()
        await expect(cell(page, '1:6')).toHaveText(key === 'Backspace' ? '237' : '0')
      }
      await select(page, 'E2', '1:4')
      await expect(cell(page, '1:4')).toHaveText(key === 'Delete' ? '' : '3')
      await expect(cell(page, '1:5')).toHaveText('79')
      await select(page, 'A2', '1:0')
      await expect(cell(page, '1:0')).toHaveText('SO-10001')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    })
})
