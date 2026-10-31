import { expect, test } from '@playwright/test'
import { button, cell, focusGrid, openSummary, select, selectedCells, status } from './support'

test.beforeEach(async ({ page }) => { await openSummary(page) })

/** Summary 左上角的 A1:B2 与周围的空行空列隔开。 */
const REGION = ['0:0', '0:1', '1:0', '1:1']

test('Ctrl+Shift+8 selects the current region around the active cell at 1280px', async ({ page }) => {
  await select(page, 'B2', '1:1')
  await focusGrid(page)
  await page.keyboard.press('Control+Shift+8')
  await expect(status(page)).toContainText('Selected current region A1:B2.')
  expect(await selectedCells(page)).toEqual(REGION)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('Go to special Current region selects the region of the active cell at 1280px', async ({ page }) => {
  await select(page, 'A2', '1:0')
  await button(page, 'Go to special').click()
  const dialog = page.getByRole('dialog', { name: 'Go to special' })
  await dialog.getByRole('button', { name: 'Current region', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(await selectedCells(page)).toEqual(REGION)
  await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
  await expect(cell(page, 1, 0)).toHaveAttribute('data-selected', 'true')
})

test('Ctrl+A selects the current region first and the whole sheet second at 1280px', async ({ page }) => {
  await select(page, 'B2', '1:1')
  await focusGrid(page)
  await page.keyboard.press('ControlOrMeta+a')
  await expect(status(page)).toContainText('Selected current region.')
  expect(await selectedCells(page)).toEqual(REGION)
  await page.keyboard.press('ControlOrMeta+a')
  await expect(cell(page, 0, 7)).toHaveAttribute('data-selected', 'true')
  await expect(cell(page, 0, 0)).toHaveAttribute('data-selected', 'true')
  await expect(cell(page, 0, 3)).toHaveAttribute('data-selected', 'true')
})

test('Ctrl+A in an empty cell selects the whole sheet immediately at 1280px', async ({ page }) => {
  await select(page, 'E3', '2:4')
  await focusGrid(page)
  await page.keyboard.press('ControlOrMeta+a')
  await expect(cell(page, 0, 0)).toHaveAttribute('data-selected', 'true')
  await expect(cell(page, 2, 4)).toHaveAttribute('data-selected', 'true')
})
