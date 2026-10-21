import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, row: number, col = 2) => page.locator(`td[data-cell="${row}:${col}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const choice = (page: Page, value: string) => page.getByRole('checkbox', { name: `Select value ${value}`, exact: true })
const valuesPage = (page: Page) => page.getByLabel('Filter values page', { exact: true })
async function open(page: Page) {
  await button(page, 'Filter column C').click()
  await button(page, 'Choose values for condition 1').click()
  await expect(valuesPage(page)).toHaveText('1–4 of 4')
}
async function records(page: Page, visible: string[]) {
  for (const [offset, value] of ['W20', 'E10', 'W10', 'E30'].entries()) {
    if (visible.includes(value)) await expect(cell(page, 25 + offset)).toHaveText(value)
    else await expect(cell(page, 25 + offset)).toHaveCount(0)
  }
  await expect(cell(page, 24, 0)).toHaveText('Team')
  await expect(cell(page, 0, 1)).toHaveText('79')
}
async function applyAndUndo(page: Page, visible: string[]) {
  await button(page, 'Apply filter').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await records(page, visible)
  await button(page, 'Undo').click()
  await records(page, ['W20', 'E10', 'W10', 'E30'])
  await expect(cell(page, 25)).toHaveCSS('font-weight', '700')
  await expect(cell(page, 26)).toHaveCSS('font-style', 'italic')
  await button(page, 'Recent operations').click()
  await expect(page.getByRole('dialog')).toContainText('1 undo · 1 redo')
  await button(page, 'Close history').click()
  await button(page, 'Redo').click()
  await records(page, visible)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A25:C29', '24:0')
  await page.getByRole('combobox', { name: 'Worksheet filter' }).selectOption('selection')
  await expect(button(page, 'Filter column C')).toBeVisible()
})

for (const width of [1280, 390]) {
  test(`choose filter values loads exact native candidates without history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await open(page)
    await expect(button(page, 'Hide values for condition 1')).toHaveAttribute('aria-expanded', 'true')
    for (const value of ['W20', 'E10', 'W10', 'E30']) await expect(choice(page, value)).not.toBeChecked()
    await expect(page.getByLabel('Filter value 1', { exact: true })).toHaveCount(0)
    await expect(button(page, 'Select page')).toBeEnabled()
    await expect(button(page, 'Clear selection')).toBeDisabled()
    await records(page, ['W20', 'E10', 'W10', 'E30'])
    await button(page, 'Cancel').click()
    await expect(button(page, 'Filter column C')).toBeFocused()
    await button(page, 'Undo').click()
    await expect(button(page, 'Filter column C')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    await records(page, ['W20', 'E10', 'W10', 'E30'])
  })

  test(`hide filter values retains selected raw strings for apply and undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await open(page)
    await choice(page, 'W20').check()
    await button(page, 'Hide values for condition 1').click()
    await expect(valuesPage(page)).toHaveCount(0)
    await expect(button(page, 'Choose values for condition 1')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByLabel('Filter condition 1', { exact: true })).toHaveValue('list')
    await expect(page.getByLabel('Filter value 1', { exact: true })).toHaveValue('W20')
    await button(page, 'Choose values for condition 1').click()
    await expect(valuesPage(page)).toHaveText('1–4 of 4')
    await expect(choice(page, 'W20')).toBeChecked()
    await expect(choice(page, 'E30')).not.toBeChecked()
    await button(page, 'Hide values for condition 1').click()
    await applyAndUndo(page, ['W20'])
  })

  test(`filter value Search button loads matching candidates without filtering until apply at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await open(page)
    await page.getByRole('searchbox', { name: 'Search filter values' }).fill('E')
    await expect(valuesPage(page)).toHaveCount(0)
    await expect(page.getByText('Press Search to load matching values.')).toBeVisible()
    await button(page, 'Search').click()
    await expect(valuesPage(page)).toHaveText('1–2 of 2')
    await expect(choice(page, 'E10')).toBeVisible()
    await expect(choice(page, 'E30')).toBeVisible()
    await expect(choice(page, 'W20')).toHaveCount(0)
    await records(page, ['W20', 'E10', 'W10', 'E30'])
    await choice(page, 'E30').check()
    await applyAndUndo(page, ['E30'])
    await open(page)
    await expect(choice(page, 'E30')).toBeChecked()
  })
}

for (const entry of [
  { action: 'toggle', visible: ['E30'] },
  { action: 'select page', visible: ['E10', 'E30'] },
  { action: 'clear selection', visible: [] },
]) for (const width of [1280, 390])
  test(`${entry.action} filter values commits the exact selected set in one undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await open(page)
    if (entry.action === 'select page') {
      await page.getByRole('searchbox', { name: 'Search filter values' }).fill('E')
      await button(page, 'Search').click()
      await expect(valuesPage(page)).toHaveText('1–2 of 2')
      await button(page, 'Select page').click()
    } else {
      await choice(page, 'W20').check()
      await choice(page, 'E30').check()
      await expect(page.getByLabel('Selected filter values')).toHaveText('2 selected')
      if (entry.action === 'toggle') await choice(page, 'W20').uncheck()
      else await button(page, 'Clear selection').click()
      await expect(choice(page, 'W20')).not.toBeChecked()
    }
    await expect(page.getByLabel('Selected filter values')).toHaveText(`${entry.visible.length} selected`)
    await records(page, ['W20', 'E10', 'W10', 'E30'])
    await applyAndUndo(page, entry.visible)
    await expect(button(page, 'Filter column C')).toHaveAttribute('data-filtered', 'true')
    await open(page)
    for (const value of ['W20', 'E10', 'W10', 'E30'])
      await expect(choice(page, value)).toBeChecked({ checked: entry.visible.includes(value) })
    await expect(button(page, 'Clear selection')).toBeEnabled({ enabled: entry.visible.length > 0 })
  })
