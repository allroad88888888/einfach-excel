import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function outline(page: Page, action: string) {
  const menu = page.getByRole('combobox', { name: 'Outline groups' })
  await menu.selectOption(action)
  await expect(menu).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
}
async function rows(page: Page, collapsed: boolean) {
  if (collapsed) {
    for (const row of [7, 8, 9, 10, 11]) await expect(cell(page, `${row}:0`)).toHaveCount(0)
    await expect(button(page, 'Expand rows 8–12, level 1')).toBeVisible()
    await expect(button(page, 'Expand rows 9–11, level 2')).toHaveCount(0)
  } else {
    await expect(cell(page, '8:0')).toHaveText('Detail 1')
    await expect(cell(page, '10:0')).toHaveText('Detail 2')
    await expect(cell(page, '11:1')).toHaveText('30')
    await expect(cell(page, '9:0')).toHaveCount(0)
    await expect(button(page, 'Collapse rows 8–12, level 1')).toBeVisible()
    await expect(button(page, 'Collapse rows 9–11, level 2')).toBeVisible()
  }
  await expect(cell(page, '0:1')).toHaveText('79')
  await expect(cell(page, '1:4')).toBeVisible()
  await expect(cell(page, '0:6')).toHaveCount(0)
}
async function columns(page: Page, collapsed: boolean) {
  for (const col of [4, 5]) {
    if (collapsed) await expect(cell(page, `1:${col}`)).toHaveCount(0)
    else await expect(cell(page, `1:${col}`)).toBeVisible()
  }
  await expect(cell(page, '0:6')).toHaveCount(0)
  await expect(cell(page, '8:0')).toHaveText('Detail 1')
  await expect(cell(page, '10:0')).toHaveText('Detail 2')
  await expect(cell(page, '11:1')).toHaveText('30')
  await expect(cell(page, '9:0')).toHaveCount(0)
  await expect(cell(page, '0:1')).toHaveText('79')
  await expect(button(page, 'Show column outline level 2')).toBeVisible()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(button(page, 'Collapse rows 8–12, level 1')).toBeVisible()
})

for (const axis of ['row', 'column'])
  for (const action of ['collapse', 'expand']) for (const width of [1280, 390])
  test(`${action} all ${axis} groups preserves manual hiding and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const state = axis === 'row' ? rows : columns
    if (action === 'expand') await outline(page, `collapse-${axis}s`)
    const collapsed = action === 'collapse'
    await state(page, !collapsed)
    await outline(page, `${action}-${axis}s`)
    await state(page, collapsed)
    await button(page, 'Undo').click()
    await state(page, !collapsed)
    // 重复已经生效的状态不能制造历史或清掉刚生成的 redo。
    await outline(page, `${collapsed ? 'expand' : 'collapse'}-${axis}s`)
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText(`${collapsed ? 0 : 1} undo · 1 redo`)
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    await state(page, collapsed)
  })
