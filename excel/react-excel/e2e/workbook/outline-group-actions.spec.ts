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
async function records(page: Page) {
  for (const [offset, value] of ['SO-10001', 'SO-10002', '00123', 'SO-10004'].entries())
    await expect(cell(page, `${offset + 1}:0`)).toHaveText(value)
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(cell(page, '1:2')).toHaveText('North')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const entry of [
  { axis: 'rows', range: 'A3:A5', coord: '2:0', label: 'rows 3–5' },
  { axis: 'columns', range: 'B2:D2', coord: '1:1', label: 'columns B–D' },
]) for (const width of [1280, 390])
  test(`group ${entry.axis} creates only membership and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await select(page, entry.range, entry.coord)
    await outline(page, `group-${entry.axis}`)
    await expect(button(page, `Collapse ${entry.label}, level 1`)).toBeVisible()
    await records(page)
    await button(page, 'Undo').click()
    await expect(button(page, `Collapse ${entry.label}, level 1`)).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    await records(page)
    await button(page, 'Redo').click()
    await expect(button(page, `Collapse ${entry.label}, level 1`)).toBeVisible()
    await records(page)
  })

for (const entry of [
  { axis: 'rows', range: 'A3:A5', coord: '2:0', label: 'rows 3–5', gutter: 'row' },
  { axis: 'columns', range: 'B2:D2', coord: '1:1', label: 'columns B–D', gutter: 'column' },
]) for (const width of [1280, 390])
  test(`ungroup ${entry.axis} removes only membership and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await select(page, entry.range, entry.coord)
    await outline(page, `group-${entry.axis}`)
    await expect(button(page, `Collapse ${entry.label}, level 1`)).toBeVisible()
    await outline(page, `ungroup-${entry.axis}`)
    await expect(page.locator(`.outline-${entry.gutter}`)).toHaveCount(0)
    await records(page)
    await button(page, 'Undo').click()
    await expect(button(page, `Collapse ${entry.label}, level 1`)).toBeVisible()
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText('1 undo · 1 redo')
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    await expect(page.locator(`.outline-${entry.gutter}`)).toHaveCount(0)
    await records(page)
  })
