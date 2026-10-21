import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, row: number) => page.locator(`td[data-cell="${row}:2"]`)
const cases = [
  { operator: 'gt', matches: [66] },
  { operator: 'lt', matches: [64] },
  { operator: 'eq', matches: [65] },
  { operator: 'ne', matches: [64, 66] },
  { operator: 'gte', matches: [65, 66] },
  { operator: 'lte', matches: [64, 65] },
  { operator: 'between', matches: [64, 65] },
  { operator: 'not-between', matches: [66] },
] as const

// C65:C67 为原生种子 2、4、6；绿色覆盖已有红色规则，边界值 4 必须可区分。
for (const width of [1280, 390]) test.describe(`${width}px value comparisons`, () => {
  test.use({ viewport: { width, height: 850 } })
  for (const entry of cases)
    test(`${entry.operator} conditional value matches its boundary and undoes once at ${width}px`, async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
      await page.getByRole('tab', { name: 'Summary', exact: true }).click()
      await select(page, 'C65:C67', '64:2')
      const baseline = await Promise.all([64, 65, 66].map(row => cell(page, row)
        .evaluate(node => getComputedStyle(node).backgroundColor)))
      const expectMatches = async (matches: readonly number[]) => {
        for (const row of [64, 65, 66]) {
          await expect(cell(page, row)).toHaveCSS('background-color', matches.includes(row)
            ? 'rgb(0, 255, 0)' : baseline[row - 64]!)
          await expect(cell(page, row)).toHaveText(String((row - 63) * 2))
        }
      }
      await button(page, 'Conditional formatting').click()
      await page.getByLabel('Condition', { exact: true }).selectOption(entry.operator)
      const twoBounds = entry.operator === 'between' || entry.operator === 'not-between'
      await page.getByLabel(twoBounds ? 'Minimum' : 'Value', { exact: true }).fill(twoBounds ? '2' : '4')
      if (twoBounds) await page.getByLabel('Maximum', { exact: true }).fill('4')
      await page.getByLabel('Highlight fill', { exact: true }).fill('#00ff00')
      await button(page, 'Add rule').click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expectMatches(entry.matches)
      await expect(page.locator('td[data-cell="65:3"]'))
        .toHaveCSS('background-color', 'rgb(217, 234, 247)')
      await button(page, 'Undo').click()
      await expectMatches([]); await expect(button(page, 'Undo')).toBeDisabled()
      await button(page, 'Redo').click(); await expectMatches(entry.matches)
      await button(page, 'Conditional formatting').click(); await button(page, 'Edit rule 1').click()
      await expect(page.getByLabel('Condition', { exact: true })).toHaveValue(entry.operator)
      await expect(page.getByLabel(twoBounds ? 'Minimum' : 'Value', { exact: true }))
        .toHaveValue(twoBounds ? '2' : '4')
      if (twoBounds) await expect(page.getByLabel('Maximum', { exact: true })).toHaveValue('4')
      await expect(page.getByLabel('Applies to')).toHaveValue('C65:C67')
    })
})
