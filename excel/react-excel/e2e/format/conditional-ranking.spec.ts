import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const green = 'rgb(0, 255, 0)'

async function expectRanking(page: Page, matches: readonly number[], baseline: readonly string[]) {
  for (const row of [64, 65, 66]) {
    await expect(cell(page, `${row}:2`)).toHaveCSS(
      'background-color', matches.includes(row) ? green : baseline[row - 64]!,
    )
  }
}

// 原生种子 C65:C67 = 2、4、6；每种排名从同一份零历史种子独立执行。
const cases = [
  { direction: 'top', unit: 'items', count: '2', matches: [65, 66] },
  { direction: 'top', unit: 'percent', count: '50', matches: [66] },
  { direction: 'bottom', unit: 'items', count: '2', matches: [64, 65] },
  { direction: 'bottom', unit: 'percent', count: '50', matches: [64] },
] as const

for (const width of [1280, 390]) test.describe(`${width}px conditional ranking`, () => {
  test.use({ viewport: { width, height: 850 } })

  for (const entry of cases) test(`${entry.direction} ${entry.unit} conditional ranking undoes once at ${width}px`, async ({ page }) => {
    await page.goto('/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'C65:C67', '64:2')
    // 原生种子已有红色条件规则；新排名必须用不同颜色，撤销则恢复原始投影。
    const baseline = await Promise.all([64, 65, 66].map(row => cell(page, `${row}:2`)
      .evaluate(node => getComputedStyle(node).backgroundColor)))
    await button(page, 'Conditional formatting').click()
    await page.getByLabel('Rule type').selectOption('top-bottom')
    await page.getByLabel('Rank direction').selectOption(entry.direction)
    await page.getByLabel('Rank by').selectOption(entry.unit)
    await page.getByLabel('Highlight fill', { exact: true }).fill('#00ff00')
    await page.getByLabel(entry.unit === 'items' ? 'Number of items' : 'Percentage', { exact: true })
      .fill(entry.count)
    await button(page, 'Add rule').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expectRanking(page, entry.matches, baseline)
    for (const [row, value] of [[64, '2'], [65, '4'], [66, '6']] as const)
      await expect(cell(page, `${row}:2`)).toHaveText(value)
    await expect(cell(page, '65:3')).toHaveCSS('background-color', 'rgb(217, 234, 247)')
    await button(page, 'Undo').click()
    await expectRanking(page, [], baseline)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expectRanking(page, entry.matches, baseline)
    await button(page, 'Conditional formatting').click(); await button(page, 'Edit rule 1').click()
    await expect(page.getByLabel('Rank direction')).toHaveValue(entry.direction)
    await expect(page.getByLabel('Rank by')).toHaveValue(entry.unit)
    await expect(page.getByLabel(entry.unit === 'items' ? 'Number of items' : 'Percentage', { exact: true }))
      .toHaveValue(entry.count)
    await expect(page.getByLabel('Applies to')).toHaveValue('C65:C67')
  })
})
