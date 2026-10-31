import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const grid = (page: Page) => page.locator('[data-workbook-grid]')

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

async function undoCount(page: Page): Promise<string> {
  await button(page, 'Recent operations').click()
  const text = (await page.getByRole('dialog').locator('p').first().textContent()) ?? ''
  await button(page, 'Close history').click()
  return text.trim()
}

test('Repeat button is disabled until a repeatable command ran and names it in the tooltip', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await expect(button(page, 'Repeat')).toBeDisabled()
  await expect(button(page, 'Repeat')).toHaveAttribute('title', 'Repeat (F4)')
  await button(page, 'Bold').click()
  await expect(cell(page, '2:1')).toHaveCSS('font-weight', '700')
  await expect(button(page, 'Repeat')).toBeEnabled()
  await expect(button(page, 'Repeat')).toHaveAttribute('title', 'Repeat Bold (F4)')
})

test('F4 repeats Bold on another range', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await button(page, 'Bold').click()
  await expect(cell(page, '2:1')).toHaveCSS('font-weight', '700')
  await select(page, 'D5:E6', '4:3')
  await expect(cell(page, '4:3')).not.toHaveCSS('font-weight', '700')
  await grid(page).press('F4')
  for (const coord of ['4:3', '4:4', '5:3', '5:4'])
    await expect(cell(page, coord)).toHaveCSS('font-weight', '700')
})

test('The Repeat button repeats the last fill color on the current selection', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await button(page, 'Fill color').click()
  await expect(cell(page, '2:1')).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await select(page, 'C6', '5:2')
  await button(page, 'Repeat').click()
  await expect(cell(page, '5:2')).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await expect(button(page, 'Repeat')).toHaveAttribute('title', 'Repeat Fill color (F4)')
})

test('F4 repeats Insert rows at the new selection', async ({ page }) => {
  const moved = (await cell(page, '4:0').textContent()) ?? ''
  await select(page, 'A3', '2:0')
  await page.getByRole('combobox', { name: 'Insert or delete rows and columns' })
    .selectOption('insert-rows')
  await expect(cell(page, '2:0')).toHaveText('')
  await expect(cell(page, '5:0')).toHaveText(moved)
  await select(page, 'A4', '3:0')
  await grid(page).press('F4')
  await expect(cell(page, '3:0')).toHaveText('')
  await expect(cell(page, '6:0')).toHaveText(moved)
  await expect(button(page, 'Repeat')).toHaveAttribute('title', 'Repeat Insert rows (F4)')
})

test('Ctrl+Y redoes when something can be redone and repeats otherwise', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await button(page, 'Italic').click()
  await expect(cell(page, '2:1')).toHaveCSS('font-style', 'italic')
  await button(page, 'Undo').click()
  await expect(cell(page, '2:1')).not.toHaveCSS('font-style', 'italic')
  await select(page, 'D5', '4:3')
  await grid(page).press('Control+y')
  // Redo wins: the old cell gets its italic back and the new selection is untouched.
  await expect(cell(page, '2:1')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '4:3')).not.toHaveCSS('font-style', 'italic')
  await expect(button(page, 'Redo')).toBeDisabled()
  await grid(page).press('Control+y')
  await expect(cell(page, '4:3')).toHaveCSS('font-style', 'italic')
})

test('Each repeat is one new undo step', async ({ page }) => {
  await select(page, 'B3', '2:1')
  await button(page, 'Bold').click()
  await expect(cell(page, '2:1')).toHaveCSS('font-weight', '700')
  expect(await undoCount(page)).toContain('1 undo · 0 redo')
  await select(page, 'D5:E6', '4:3')
  await grid(page).press('F4')
  await expect(cell(page, '5:4')).toHaveCSS('font-weight', '700')
  expect(await undoCount(page)).toContain('2 undo · 0 redo')
  await button(page, 'Undo').click()
  await expect(cell(page, '5:4')).not.toHaveCSS('font-weight', '700')
  await expect(cell(page, '4:3')).not.toHaveCSS('font-weight', '700')
  await expect(cell(page, '2:1')).toHaveCSS('font-weight', '700')
})
