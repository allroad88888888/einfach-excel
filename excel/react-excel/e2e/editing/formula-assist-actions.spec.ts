import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const entries = [
  { source: 'cell', action: 'pointer' },
  { source: 'formula', action: 'pointer' },
  { source: 'cell', action: 'Enter' },
  { source: 'formula', action: 'Enter' },
  { source: 'cell', action: 'ArrowDown' },
  { source: 'cell', action: 'ArrowUp' },
  { source: 'formula', action: 'ArrowDown' },
  { source: 'formula', action: 'ArrowUp' },
] as const

for (const width of [1280, 390]) test.describe(`${width}px formula suggestion acceptance`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B3', '2:1')
  })

  for (const { source, action } of entries)
    test(`${source} ${action} accepts a function without committing its draft at ${width}px`, async ({ page }) => {
      if (source === 'cell') await cell(page, '2:1').dblclick()
      const input = page.getByRole('textbox', {
        name: source === 'cell' ? 'Cell editor' : 'Active cell value', exact: true,
      })
      const arrow = action === 'ArrowDown' || action === 'ArrowUp'
      const functionName = action === 'ArrowDown' ? 'SUMIF' : action === 'ArrowUp' ? 'SUM' : 'ROUND'
      const accepted = `=${functionName}(`
      await input.fill(arrow ? '=SU' : action === 'pointer' ? '=RO' : '=ROUND')
      const options = page.getByRole('listbox', { name: 'Formula functions' })
      await expect(options).toBeVisible()
      if (action === 'pointer') await options.getByRole('option', { name: /^ROUND / }).click()
      else {
        if (arrow) {
          await page.keyboard.press('ArrowDown')
          if (action === 'ArrowUp') await page.keyboard.press('ArrowUp')
          const selected = options.getByRole('option', { name: new RegExp(`^${functionName} `) })
          await expect(selected).toHaveAttribute('aria-selected', 'true')
          await expect(input).toHaveAttribute('aria-activedescendant', (await selected.getAttribute('id'))!)
        }
        await page.keyboard.press('Enter')
      }
      await expect(input).toBeFocused()
      await expect(input).toHaveValue(accepted)
      expect(await input.evaluate((node: HTMLTextAreaElement) =>
        [node.selectionStart, node.selectionEnd])).toEqual([accepted.length, accepted.length])
      await expect(options).toHaveCount(0)
      await expect(page.getByLabel('Formula arguments')).toContainText(`${functionName}(`)
      await expect(cell(page, '2:1')).toHaveText('Northwind')
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B3')
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await input.pressSequentially(action === 'ArrowDown' ? 'E2:E4,">1",E2:E4)' :
        action === 'ArrowUp' ? '1,2)' : '3.14159,2)')
      await expect(page.getByLabel('Formula arguments')).toHaveCount(0)
      await page.keyboard.press('Enter')
      const result = action === 'ArrowDown' ? '5' : action === 'ArrowUp' ? '3' : '3.14'
      await expect(cell(page, '2:1')).toHaveText(result)
      await expect(page.locator('[data-workbook-grid]')).toBeFocused()
      await expect(cell(page, '2:0')).toHaveText('SO-10002')
      await expect(cell(page, '2:2')).toHaveText('East')
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(cell(page, '2:1')).toHaveText('Northwind')
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: 'Redo', exact: true }).click()
      await expect(cell(page, '2:1')).toHaveText(result)
      await select(page, 'A2', '1:0')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    })
})
