import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, row: number, col = 2) => page.locator(`td[data-cell="${row}:${col}"]`)
const menu = (page: Page) => page.getByRole('combobox', { name: 'Worksheet filter' })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const records = ['W20', 'E10', 'W10', 'E30']
async function visibleRecords(page: Page, rows: number[]) {
  for (const [offset, value] of records.entries()) {
    if (rows.includes(offset)) await expect(cell(page, 25 + offset)).toHaveText(value)
    else await expect(cell(page, 25 + offset)).toHaveCount(0)
  }
  await expect(cell(page, 24, 0)).toHaveText('Team')
  await expect(cell(page, 0, 1)).toHaveText('79')
}
async function open(page: Page) {
  await menu(page).selectOption('open')
  return page.getByRole('dialog', { name: 'Filter conditions' })
}
async function apply(page: Page) {
  await button(page, 'Apply filter').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function westWithMinimum(page: Page) {
  const dialog = await open(page)
  await dialog.getByLabel('Filter column 1', { exact: true }).selectOption('0')
  await dialog.getByLabel('Filter value 1', { exact: true }).fill('West')
  await dialog.getByRole('button', { name: 'Add condition', exact: true }).click()
  await expect(dialog.getByLabel('Filter column 2', { exact: true })).toHaveValue('1')
  await dialog.getByLabel('Filter condition 2', { exact: true }).selectOption('range')
  await dialog.getByLabel('Minimum 2', { exact: true }).fill('15')
  await dialog.getByLabel('Maximum 2', { exact: true }).fill('30')
  return dialog
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('A25:C29')
  await name.press('Enter')
  await expect(name).toHaveValue('A25:C29')
  await menu(page).selectOption('selection')
  await expect(button(page, 'Filter column A')).toHaveAttribute('data-filtered', 'false')
})

for (const entry of [
  { kind: 'contains', col: '0', value: 'aSt', rows: [1, 3] },
  { kind: 'range', col: '1', value: '', rows: [0, 1, 2] },
  { kind: 'list', col: '2', value: 'W20\nE30', rows: [0, 3] },
]) for (const width of [1280, 390])
  test(`filter ${entry.kind} independently preserves sources and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await menu(page).selectOption('open')
    const dialog = page.getByRole('dialog', { name: 'Filter conditions' })
    await dialog.getByLabel('Filter column 1', { exact: true }).selectOption(entry.col)
    await dialog.getByLabel('Filter condition 1', { exact: true }).selectOption(entry.kind)
    if (entry.kind === 'range') {
      await dialog.getByLabel('Minimum 1', { exact: true }).fill('10')
      await dialog.getByLabel('Maximum 1', { exact: true }).fill('20')
    } else await dialog.getByLabel('Filter value 1', { exact: true }).fill(entry.value)
    await dialog.getByRole('button', { name: 'Apply filter', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await visibleRecords(page, entry.rows)
    await button(page, 'Undo').click()
    await visibleRecords(page, [0, 1, 2, 3])
    await expect(cell(page, 25)).toHaveCSS('font-weight', '700')
    await expect(cell(page, 26)).toHaveCSS('font-style', 'italic')
    for (const col of ['A', 'B', 'C'])
      await expect(button(page, `Filter column ${col}`)).toHaveAttribute('data-filtered', 'false')
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText('1 undo · 1 redo')
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    await visibleRecords(page, entry.rows)
    await menu(page).selectOption('open')
    await expect(dialog.getByLabel('Filter column 1', { exact: true })).toHaveValue(entry.col)
    await expect(dialog.getByLabel('Filter condition 1', { exact: true })).toHaveValue(entry.kind)
    if (entry.kind === 'range') {
      await expect(dialog.getByLabel('Minimum 1', { exact: true })).toHaveValue('10')
      await expect(dialog.getByLabel('Maximum 1', { exact: true })).toHaveValue('20')
    } else await expect(dialog.getByLabel('Filter value 1', { exact: true })).toHaveValue(entry.value)
  })

for (const width of [1280, 390]) {
  test(`filter match case toggles exact matching without changing source data at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const dialog = await open(page)
    await dialog.getByLabel('Filter column 1', { exact: true }).selectOption('0')
    await dialog.getByLabel('Filter condition 1', { exact: true }).selectOption('contains')
    await dialog.getByLabel('Filter value 1', { exact: true }).fill('aSt')
    await dialog.getByRole('checkbox', { name: 'Match case', exact: true }).check()
    await apply(page)
    await visibleRecords(page, [])
    await button(page, 'Undo').click()
    await visibleRecords(page, [0, 1, 2, 3])
    await button(page, 'Redo').click()
    await visibleRecords(page, [])
    await open(page)
    await expect(dialog.getByRole('checkbox', { name: 'Match case', exact: true })).toBeChecked()
    await dialog.getByRole('checkbox', { name: 'Match case', exact: true }).uncheck()
    await apply(page)
    await visibleRecords(page, [1, 3])
    await button(page, 'Undo').click()
    await visibleRecords(page, [])
    await button(page, 'Redo').click()
    await visibleRecords(page, [1, 3])
    await expect(cell(page, 26)).toHaveCSS('font-style', 'italic')
    await open(page)
    await expect(dialog.getByRole('checkbox', { name: 'Match case', exact: true })).not.toBeChecked()
  })

  test(`add filter condition intersects columns and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const dialog = await westWithMinimum(page)
    await expect(dialog.getByLabel('Filter column 2', { exact: true }).locator('option[value="0"]')).toBeDisabled()
    await apply(page)
    await visibleRecords(page, [0])
    await expect(button(page, 'Filter column A')).toHaveAttribute('data-filtered', 'true')
    await expect(button(page, 'Filter column B')).toHaveAttribute('data-filtered', 'true')
    await button(page, 'Undo').click()
    await visibleRecords(page, [0, 1, 2, 3])
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText('1 undo · 1 redo')
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    await visibleRecords(page, [0])
    await expect(cell(page, 25)).toHaveCSS('font-weight', '700')
    await open(page)
    await expect(dialog.getByLabel('Filter value 1', { exact: true })).toHaveValue('West')
    await expect(dialog.getByLabel('Minimum 2', { exact: true })).toHaveValue('15')
  })

  test(`remove filter condition preserves the remaining column and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const dialog = await westWithMinimum(page)
    await apply(page)
    await visibleRecords(page, [0])
    await open(page)
    await dialog.getByRole('button', { name: 'Remove condition 2', exact: true }).click()
    await expect(dialog.getByLabel('Filter column 2', { exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Remove condition 1', exact: true })).toBeDisabled()
    await apply(page)
    await visibleRecords(page, [0, 2])
    await expect(button(page, 'Filter column B')).toHaveAttribute('data-filtered', 'false')
    await button(page, 'Undo').click()
    await visibleRecords(page, [0])
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText('2 undo · 1 redo')
    await button(page, 'Close history').click()
    await button(page, 'Redo').click()
    await visibleRecords(page, [0, 2])
    await expect(cell(page, 25)).toHaveCSS('font-weight', '700')
    await open(page)
    await expect(dialog.getByLabel('Filter value 1', { exact: true })).toHaveValue('West')
    await expect(dialog.getByLabel('Filter column 2', { exact: true })).toHaveCount(0)
  })
}
