import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

for (const width of [1280, 390]) test.describe(`${width}px native editing entries`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B3', '2:1')
  })

  for (const entry of ['double-click', 'F2', 'printable key'] as const)
    test(`${entry} opens the correct native draft and commits once at ${width}px`, async ({ page }) => {
      if (entry === 'double-click') await cell(page, '2:1').dblclick()
      else await page.locator('[data-workbook-grid]').press(entry === 'F2' ? 'F2' : 'x')
      const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
      const draft = entry === 'printable key' ? 'x' : 'Northwind'
      await expect(editor).toHaveValue(draft)
      await expect(editor).toBeFocused()
      const caret = await editor.evaluate((node: HTMLTextAreaElement) =>
        [node.selectionStart, node.selectionEnd])
      expect(caret).toEqual(entry === 'double-click' ? [0, draft.length] : [draft.length, draft.length])
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B3')
      await expect(cell(page, '2:1')).toHaveText('Northwind')
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await editor.pressSequentially(entry === 'double-click' ? 'Changed' : 'yz')
      const saved = entry === 'double-click' ? 'Changed' : `${draft}yz`
      await editor.press('Enter')
      await expect(editor).toHaveCount(0)
      await expect(cell(page, '2:1')).toHaveText(saved)
      await expect(cell(page, '2:0')).toHaveText('SO-10002')
      await expect(cell(page, '2:2')).toHaveText('East')
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B4')
      await expect(page.locator('[data-workbook-grid]')).toBeFocused()
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(cell(page, '2:1')).toHaveText('Northwind')
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Redo', exact: true }).click()
      await expect(cell(page, '2:1')).toHaveText(saved)
      await select(page, 'A2', '1:0')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    })
})
