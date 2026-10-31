import { expect, test } from '@playwright/test'
import {
  cell,
  chooseTabMenu,
  downloadWorkbook,
  menuItem,
  openSeed,
  openTabMenu,
  openWorkbookText,
  redo,
  tab,
  tabs,
  undo,
} from './support'

test.beforeEach(async ({ page }) => openSeed(page))

test('duplicate sheet copies data formulas and formatting into Sheet (2) and activates it', async ({ page }) => {
  await chooseTabMenu(page, 'Sales Orders', 'Duplicate')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Sales Orders (2)', 'Summary'])
  await expect(tab(page, 'Sales Orders (2)')).toHaveAttribute('aria-selected', 'true')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  // 修改副本不影响源表。
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await cell(page, '1:0').click()
  await input.fill('Copy only')
  await input.press('Enter')
  await tab(page, 'Sales Orders').click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  // 公式随副本复制并继续计算。
  await chooseTabMenu(page, 'Summary', 'Duplicate')
  await expect(tab(page, 'Summary (2)')).toHaveAttribute('aria-selected', 'true')
  await expect(cell(page, '0:1')).toHaveText('79')
  await cell(page, '0:1').click()
  await expect(input).toHaveValue("='Sales Orders'!G2")
})

test('duplicate sheet is one undo step and redo restores the same copy', async ({ page }) => {
  await chooseTabMenu(page, 'Sales Orders', 'Duplicate')
  await expect(tabs(page)).toHaveCount(3)
  await undo(page)
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary'])
  await redo(page)
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Sales Orders (2)', 'Summary'])
  await tab(page, 'Sales Orders (2)').click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('hide sheet removes its tab while formulas that read it keep working, and undo shows it', async ({ page }) => {
  await chooseTabMenu(page, 'Sales Orders', 'Hide')
  await expect(tabs(page)).toHaveText(['Summary'])
  await expect(tab(page, 'Summary')).toHaveAttribute('aria-selected', 'true')
  await expect(cell(page, '0:1')).toHaveText('79')
  await undo(page)
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary'])
  await redo(page)
  await expect(tabs(page)).toHaveText(['Summary'])
})

test('unhide dialog lists hidden sheets and restores the chosen one', async ({ page }) => {
  await chooseTabMenu(page, 'Sales Orders', 'Hide')
  await openTabMenu(page, 'Summary')
  await menuItem(page, 'Unhide…').click()
  const dialog = page.getByRole('dialog', { name: 'Unhide worksheet' })
  await expect(dialog.getByRole('option')).toHaveText(['Sales Orders'])
  await dialog.getByRole('option', { name: 'Sales Orders' }).click()
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Summary'])
  await undo(page)
  await expect(tabs(page)).toHaveText(['Summary'])
})

test('the last visible sheet cannot be hidden', async ({ page }) => {
  await chooseTabMenu(page, 'Sales Orders', 'Hide')
  await openTabMenu(page, 'Summary')
  await expect(menuItem(page, 'Hide')).toBeDisabled()
  await expect(menuItem(page, 'Unhide…')).toBeEnabled()
})

test('tab color can be set from the palette and cleared with No color, each undoable', async ({ page }) => {
  await openTabMenu(page, 'Summary')
  await menuItem(page, 'Tab color').click()
  await page.getByRole('group', { name: 'Tab color' }).getByRole('button', { name: 'Red', exact: true }).click()
  await expect(tab(page, 'Summary')).toHaveAttribute('data-tab-color', '#FF0000')
  await expect(tab(page, 'Sales Orders')).not.toHaveAttribute('data-tab-color', /.+/)
  await openTabMenu(page, 'Summary')
  await menuItem(page, 'Tab color').click()
  await page.getByRole('button', { name: 'No color', exact: true }).click()
  await expect(tab(page, 'Summary')).not.toHaveAttribute('data-tab-color', /.+/)
  await undo(page)
  await expect(tab(page, 'Summary')).toHaveAttribute('data-tab-color', '#FF0000')
  await undo(page)
  await expect(tab(page, 'Summary')).not.toHaveAttribute('data-tab-color', /.+/)
})

test('download and open keep hidden sheets and tab colors', async ({ page }) => {
  await chooseTabMenu(page, 'Sales Orders', 'Hide')
  await openTabMenu(page, 'Summary')
  await menuItem(page, 'Tab color').click()
  await page.getByRole('button', { name: 'Blue', exact: true }).click()
  const text = await downloadWorkbook(page)
  const saved = JSON.parse(text).workbook.sheets
  expect(saved[0].hidden).toBe(true)
  expect(saved[1].tabColor).toBe('#0070C0')
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openWorkbookText(page, text)
  await expect(tabs(page)).toHaveText(['Summary'])
  await expect(tab(page, 'Summary')).toHaveAttribute('data-tab-color', '#0070C0')
  await openTabMenu(page, 'Summary')
  await menuItem(page, 'Unhide…').click()
  await expect(page.getByRole('dialog', { name: 'Unhide worksheet' }).getByRole('option')).toHaveText([
    'Sales Orders',
  ])
})

test('Ctrl+PageUp and Ctrl+PageDown skip hidden sheets', async ({ page }) => {
  await page.getByRole('button', { name: 'New sheet', exact: true }).click()
  await expect(tabs(page)).toHaveCount(3)
  await chooseTabMenu(page, 'Summary', 'Hide')
  await expect(tabs(page)).toHaveText(['Sales Orders', 'Sheet3'])
  await tab(page, 'Sales Orders').click()
  await cell(page, '1:0').click()
  await page.keyboard.press('Control+PageDown')
  await expect(tab(page, 'Sheet3')).toHaveAttribute('aria-selected', 'true')
  await cell(page, '0:0').click()
  await page.keyboard.press('Control+PageUp')
  await expect(tab(page, 'Sales Orders')).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Next sheet', exact: true }).click()
  await expect(tab(page, 'Sheet3')).toHaveAttribute('aria-selected', 'true')
})
