import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function rows(page: Page, collapsed: boolean) {
  for (const [coord, value] of [['8:0', 'Detail 1'], ['10:0', 'Detail 2']]) {
    if (collapsed) await expect(cell(page, coord)).toHaveCount(0)
    else await expect(cell(page, coord)).toHaveText(value)
  }
  await expect(cell(page, '11:1')).toHaveText(collapsed ? '0' : '30')
  await expect(cell(page, '9:0')).toHaveCount(0)
  await expect(cell(page, '7:0')).toHaveText('Outline')
  await expect(cell(page, '0:1')).toHaveText('79')
  await expect(button(page, 'Collapse rows 8–12, level 1')).toHaveAttribute('aria-expanded', 'true')
  await expect(button(page, `${collapsed ? 'Expand' : 'Collapse'} rows 9–11, level 2`))
    .toHaveAttribute('aria-expanded', String(!collapsed))
}
async function columns(page: Page, collapsed: boolean) {
  await select(page, 'A1', '0:0')
  for (const col of [4, 5]) {
    if (collapsed) await expect(cell(page, `1:${col}`)).toHaveCount(0)
    else await expect(cell(page, `1:${col}`)).toBeVisible()
  }
  await expect(cell(page, '0:6')).toHaveCount(0)
  await expect(cell(page, '8:0')).toHaveText('Detail 1')
  await expect(cell(page, '11:1')).toHaveText('30')
  await expect(cell(page, '9:0')).toHaveCount(0)
  await expect(cell(page, '0:1')).toHaveText('79')
  await select(page, 'H2', '1:7')
  await expect(button(page, `${collapsed ? 'Expand' : 'Collapse'} columns E–G, level 1`))
    .toHaveAttribute('aria-expanded', String(!collapsed))
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await rows(page, false)
})

for (const entry of [
  { axis: 'row', action: 'collapse', label: 'rows 9–11, level 2' },
  { axis: 'row', action: 'expand', label: 'rows 9–11, level 2' },
  { axis: 'column', action: 'collapse', label: 'columns E–G, level 1' },
  { axis: 'column', action: 'expand', label: 'columns E–G, level 1' },
]) for (const width of [1280, 390])
  test(`${entry.axis} gutter ${entry.action} changes only its child group in one undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const state = entry.axis === 'row' ? rows : columns
    await state(page, false)
    if (entry.action === 'expand') {
      await button(page, `Collapse ${entry.label}`).click()
      await state(page, true)
    }
    await button(page, `${entry.action === 'collapse' ? 'Collapse' : 'Expand'} ${entry.label}`).click()
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    const collapsed = entry.action === 'collapse'
    await state(page, collapsed)
    await button(page, 'Undo').click()
    await state(page, !collapsed)
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText(`${collapsed ? 0 : 1} undo · 1 redo`)
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    await state(page, collapsed)
  })
