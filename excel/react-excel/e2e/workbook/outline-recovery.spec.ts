import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function outline(page: Page, action: string) {
  const menu = page.getByRole('combobox', { name: 'Outline groups' })
  await menu.selectOption(action)
  await expect(menu).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

// 空正文不能把唯一的展开入口一起隐藏；级别按钮必须独立于单元格投影。
for (const axis of ['row', 'column'] as const) {
  test(`all ${axis} groups can be expanded after every cell is hidden`, async ({ page }) => {
    await select(page, axis === 'row' ? 'A1:A1001' : 'A1:P1', '0:0')
    await outline(page, `group-${axis}s`)
    // 范围选择的活动格在末端；明确回到 A1，再验证展开保留这个位置。
    await select(page, 'A1', '0:0')
    await outline(page, `collapse-${axis}s`)
    await expect(page.locator('td[data-cell]')).toHaveCount(0)
    const expand = button(page, `Show ${axis} outline level 2`)
    await expect(expand).toBeVisible()
    await expect(expand).toBeEnabled()
    await expand.focus()
    await expand.press('Enter')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    await button(page, 'Undo').click()
    await expect(page.locator('td[data-cell]')).toHaveCount(0)
    await button(page, 'Redo').click()
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
  })
}

test('ungrouping collapsed rows retains visibility and undo restores the expandable group', async ({ page }) => {
  await select(page, 'A3:A5', '2:0')
  await outline(page, 'group-rows')
  await button(page, 'Collapse rows 3–5, level 1').click()
  await expect(cell(page, '2:0')).toHaveCount(0)
  // 用跨越隐藏行的可见范围取消分组，不依赖点击不可见单元格。
  await select(page, 'A2:A6', '1:0')
  await outline(page, 'ungroup-rows')
  await expect(page.locator('.outline-row')).toHaveCount(0)
  await expect(cell(page, '2:0')).toHaveCount(0)
  await button(page, 'Undo').click()
  await button(page, 'Expand rows 3–5, level 1').click()
  await expect(cell(page, '2:0')).toHaveText('SO-10002')
  await expect(cell(page, '4:0')).toHaveText('SO-10004')
})

for (const width of [1280, 390])
  test(`overlapping group rejection preserves redo and a corrected range commits once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await select(page, 'H14', '13:7')
    const input = page.getByRole('textbox', { name: 'Active cell value' })
    await input.fill('Keep redo'); await input.press('Enter')
    await expect(cell(page, '13:7')).toHaveText('Keep redo')
    await button(page, 'Undo').click()
    await select(page, 'A11:A14', '10:0')
    await page.getByRole('combobox', { name: 'Outline groups' }).selectOption('group-rows')
    await expect(page.getByRole('alert')).toContainText('not partially overlap')
    await expect(button(page, 'Collapse rows 8–12, level 1')).toBeVisible()
    await expect(button(page, 'Collapse rows 9–11, level 2')).toBeVisible()
    await expect(cell(page, '11:1')).toHaveText('30')
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText('0 undo · 1 redo')
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    await select(page, 'H14', '13:7')
    await expect(cell(page, '13:7')).toHaveText('Keep redo')
    await button(page, 'Undo').click()
    await expect(cell(page, '13:7')).toHaveText('')
    await select(page, 'A13:A14', '12:0')
    await outline(page, 'group-rows')
    await expect(button(page, 'Collapse rows 13–14, level 1')).toBeVisible()
    await expect(cell(page, '11:1')).toHaveText('30')
    await expect(cell(page, '9:0')).toHaveCount(0)
    await button(page, 'Undo').click()
    await expect(button(page, 'Collapse rows 13–14, level 1')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(button(page, 'Collapse rows 13–14, level 1')).toBeVisible()
    await expect(button(page, 'Collapse rows 9–11, level 2')).toBeVisible()
    await expect(cell(page, '0:1')).toHaveText('79')
  })
