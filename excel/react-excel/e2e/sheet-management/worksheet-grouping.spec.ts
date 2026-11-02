import { expect, test } from '@playwright/test'
import { cell, chooseTabMenu, menuItem, openSeed, openTabMenu, redo, tab, tabs, undo } from './support'

test.beforeEach(async ({ page }) => openSeed(page))

test('Ctrl/Cmd+Click and Shift+Click group worksheet tabs, and Ungroup sheets or clicking an ungrouped tab ungroups them', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New sheet', exact: true }).click()
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary', 'Sheet3'])
  await tab(page, 'Sales Orders').click()
  await expect(page.locator('[data-sheet-group-badge]')).toHaveCount(0)

  // Ctrl+Click adds Sheet3 to the group without including Summary
  await tab(page, 'Sheet3').click({ modifiers: ['Control'] })
  await expect(page.locator('[data-sheet-group-badge]')).toHaveText('[Group]')
  await expect(tab(page, 'Sales Orders')).toHaveAttribute('data-grouped', 'true')
  await expect(tab(page, 'Summary')).not.toHaveAttribute('data-grouped')
  await expect(tab(page, 'Sheet3')).toHaveAttribute('data-grouped', 'true')

  // Ungroup sheets from context menu resets to active sheet only
  await chooseTabMenu(page, 'Sales Orders', 'Ungroup sheets')
  await expect(page.locator('[data-sheet-group-badge]')).toHaveCount(0)
  await expect(tab(page, 'Sales Orders')).not.toHaveAttribute('data-grouped')
  await expect(tab(page, 'Sheet3')).not.toHaveAttribute('data-grouped')

  // Shift+Click groups contiguous visible sheets from Sales Orders to Sheet3
  await tab(page, 'Sheet3').click({ modifiers: ['Shift'] })
  await expect(page.locator('[data-sheet-group-badge]')).toHaveText('[Group]')
  await expect(tab(page, 'Sales Orders')).toHaveAttribute('data-grouped', 'true')
  await expect(tab(page, 'Summary')).toHaveAttribute('data-grouped', 'true')
  await expect(tab(page, 'Sheet3')).toHaveAttribute('data-grouped', 'true')

  // Normal click on a tab switches active sheet and ungroups
  await tab(page, 'Summary').click()
  await expect(page.locator('[data-sheet-group-badge]')).toHaveCount(0)
  await expect(tab(page, 'Summary')).toHaveAttribute('aria-selected', 'true')
  await expect(tab(page, 'Summary')).not.toHaveAttribute('data-grouped')
})

test('Select all sheets from the tab context menu groups all visible sheets', async ({ page }) => {
  await page.getByRole('button', { name: 'New sheet', exact: true }).click()
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary', 'Sheet3'])
  await chooseTabMenu(page, 'Summary', 'Hide')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Sheet3'])

  await chooseTabMenu(page, 'Sales Orders', 'Select all sheets')
  await expect(page.locator('[data-sheet-group-badge]')).toHaveText('[Group]')
  await expect(tab(page, 'Sales Orders')).toHaveAttribute('data-grouped', 'true')
  await expect(tab(page, 'Sheet3')).toHaveAttribute('data-grouped', 'true')

  await openTabMenu(page, 'Sales Orders')
  await expect(menuItem(page, 'Select all sheets')).toBeDisabled()
  await expect(menuItem(page, 'Ungroup sheets')).toBeEnabled()
})

test('Editing a cell, formatting, or clearing while sheets are grouped writes to all grouped sheets and undoes in one step', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New sheet', exact: true }).click()
  await tab(page, 'Sales Orders').click()
  await tab(page, 'Sheet3').click({ modifiers: ['Control'] })
  await expect(page.locator('[data-sheet-group-badge]')).toHaveText('[Group]')

  // Edit cell 0:0 (A1) on grouped sheets ['Sales Orders', 'Sheet3']
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await cell(page, '0:0').click()
  await input.fill('Grouped Header')
  await input.press('Enter')
  await expect(cell(page, '0:0')).toHaveText('Grouped Header')

  // Format cell 0:0 (A1) italic across grouped sheets
  await cell(page, '0:0').click()
  await page.getByRole('button', { name: 'Italic', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveCSS('font-style', 'italic')

  // Verify Sheet3 received both the cell edit and the format, while Summary (ungrouped) did not
  await tab(page, 'Sheet3').click()
  await expect(cell(page, '0:0')).toHaveText('Grouped Header')
  await expect(cell(page, '0:0')).toHaveCSS('font-style', 'italic')

  await tab(page, 'Summary').click()
  await expect(cell(page, '0:0')).toHaveText('First order total')

  // Single undo reverts italic on both sheets; second undo reverts the grouped cell input on both sheets
  await undo(page)
  await tab(page, 'Sheet3').click()
  await expect(cell(page, '0:0')).toHaveText('Grouped Header')
  await expect(cell(page, '0:0')).toHaveCSS('font-style', 'normal')

  await undo(page)
  await expect(cell(page, '0:0')).toHaveText('')
  await tab(page, 'Sales Orders').click()
  await expect(cell(page, '0:0')).toHaveText('Order')

  // Redo restores the grouped cell input on both sheets, then group again and clear contents across both sheets
  await redo(page)
  await expect(cell(page, '0:0')).toHaveText('Grouped Header')
  await tab(page, 'Sheet3').click({ modifiers: ['Control'] })
  await cell(page, '0:0').click()
  await page.keyboard.press('Delete')
  await expect(cell(page, '0:0')).toHaveText('')

  await tab(page, 'Sheet3').click()
  await expect(cell(page, '0:0')).toHaveText('')
  await undo(page)
  await expect(cell(page, '0:0')).toHaveText('Grouped Header')
})
