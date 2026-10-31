import { expect, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { apply, button as filterButton, menu, open } from '../advanced-filter/support'

export { select }
export const button = filterButton
export const cell = (page: Page, row: number, col: number) =>
  page.locator(`td[data-cell="${row}:${col}"]`)
export const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box', exact: true })
export const status = (page: Page) => page.getByRole('status', { name: 'Select special' })

/** Summary 表：A25:C29 是 Team/…/Code 小表，周围是空行空列。 */
export async function openSummary(page: Page) {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, 1, 0)).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, 1, 1)).toHaveText('Acme Co.')
}

/** 选区由名称框设置后，焦点要回到网格才能收到快捷键。 */
export async function focusGrid(page: Page) {
  await page.locator('[data-workbook-grid="true"]').focus()
}

/** 只保留 West 行：Summary 的 A25:C29 中 E10/E30 行被筛选隐藏。 */
export async function filterWest(page: Page) {
  await select(page, 'A25:C29', '24:0')
  await menu(page).selectOption('selection')
  await open(page)
  await page.getByRole('dialog', { name: 'Filter conditions', exact: true })
    .getByLabel('Filter column 1', { exact: true }).selectOption('0')
  await page.getByRole('dialog', { name: 'Filter conditions', exact: true })
    .getByLabel('Filter value 1', { exact: true }).fill('West')
  await apply(page)
}

export async function selectedCells(page: Page): Promise<string[]> {
  const cells = await page.locator('td[data-selected="true"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-cell') ?? ''))
  // 冻结行与正文分属不同 DOM 区域；按行列排序后与文档顺序无关。
  return cells.sort((a, b) => {
    const [ar, ac] = a.split(':').map(Number)
    const [br, bc] = b.split(':').map(Number)
    return ar - br || ac - bc
  })
}
