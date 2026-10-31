import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

// 插入/删除单元格走真实 Worker/WASM：四个位移方向、引用跟随、#REF!、合并拒绝与撤销重做。
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const structureMenu = (page: Page) =>
  page.getByRole('combobox', { name: 'Insert or delete rows and columns' })
const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true })
const redo = (page: Page) => page.getByRole('button', { name: 'Redo', exact: true })

async function openFromRibbon(page: Page, mode: 'insert' | 'delete') {
  await structureMenu(page).selectOption(`${mode}-cells`)
  const dialog = page.getByRole('dialog', { name: mode === 'insert' ? 'Insert' : 'Delete' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function confirm(page: Page, dialog: ReturnType<Page['getByRole']>, option: string) {
  await dialog.getByRole('radio', { name: option, exact: true }).check()
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}

async function summaryTotal(page: Page, expected: string) {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText(expected)
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(cell(page, '1:0')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('insert cells shift right from the ribbon moves the row band, follows references and undoes once', async ({ page }) => {
  await select(page, 'B2', '1:1')
  const total = await cell(page, '1:6').innerText()
  await confirm(page, await openFromRibbon(page, 'insert'), 'Shift cells right')
  await expect(cell(page, '1:1')).toHaveText('')
  await expect(cell(page, '1:2')).toHaveText('Acme Co.')
  await expect(cell(page, '1:7')).toHaveText(total)
  // 下一行不在位移带内。
  await expect(cell(page, '2:1')).not.toHaveText('')
  await summaryTotal(page, total)
  await undo(page).click()
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(cell(page, '1:6')).toHaveText(total)
  await redo(page).click()
  await expect(cell(page, '1:2')).toHaveText('Acme Co.')
})

test('Ctrl+Shift+= opens Insert and shift down moves only the selected column', async ({ page }) => {
  const grid = await select(page, 'A2', '1:0')
  await grid.click()
  await page.keyboard.press('Control+Shift+Equal')
  const dialog = page.getByRole('dialog', { name: 'Insert' })
  await expect(dialog.getByRole('radio', { name: 'Shift cells down', exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(cell(page, '1:0')).toHaveText('')
  await expect(cell(page, '2:0')).toHaveText('SO-10001')
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await undo(page).click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('cell context menu Delete shift left closes the gap and keeps references to moved cells', async ({ page }) => {
  await select(page, 'B2', '1:1')
  const region = await cell(page, '1:2').innerText()
  const total = await cell(page, '1:6').innerText()
  await cell(page, '1:1').click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Cell actions' })
  await menu.getByRole('menuitem', { name: 'Delete…' }).click()
  await expect(menu).toHaveCount(0)
  await confirm(page, page.getByRole('dialog', { name: 'Delete' }), 'Shift cells left')
  await expect(cell(page, '1:1')).toHaveText(region)
  await expect(cell(page, '1:5')).toHaveText(total)
  await expect(cell(page, '2:1')).toHaveText('Northwind')
  await summaryTotal(page, total)
  await undo(page).click()
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
})

test('Ctrl+- opens Delete and shift up pulls the column below into the selection', async ({ page }) => {
  const grid = await select(page, 'A2', '1:0')
  await grid.click()
  await page.keyboard.press('Control+Minus')
  const dialog = page.getByRole('dialog', { name: 'Delete' })
  await expect(dialog.getByRole('radio', { name: 'Shift cells up', exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(cell(page, '1:0')).toHaveText('SO-10002')
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await undo(page).click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await redo(page).click()
  await expect(cell(page, '1:0')).toHaveText('SO-10002')
})

test('deleting a referenced cell shows #REF! in the dependent sheet and undo restores the value', async ({ page }) => {
  await select(page, 'G2', '1:6')
  const total = await cell(page, '1:6').innerText()
  await confirm(page, await openFromRibbon(page, 'delete'), 'Shift cells up')
  await summaryTotal(page, '#REF!')
  await undo(page).click()
  await summaryTotal(page, total)
})

test('shifting through part of a merged cell is rejected without changing the sheet', async ({ page }) => {
  await select(page, 'C3:D4', '2:2')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  const merge = page.getByRole('alertdialog', { name: 'Merge these cells?', exact: true })
  await merge.getByRole('button', { name: 'Merge cells', exact: true }).click()
  await expect(page.locator('[data-merged-cell][data-cell="2:2"]')).toHaveCount(1)
  // 只位移第 3 行会切开跨 3–4 行的合并格。
  await select(page, 'A3', '2:0')
  const dialog = await openFromRibbon(page, 'insert')
  await dialog.getByRole('radio', { name: 'Shift cells right', exact: true }).check()
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Cannot shift cells through part of a merged cell.')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-merged-cell][data-cell="2:2"]')).toHaveCount(1)
  await expect(cell(page, '2:0')).toHaveText('SO-10002')
})

test('Insert dialog Entire row inserts whole rows through the row command', async ({ page }) => {
  await select(page, 'B2', '1:1')
  await confirm(page, await openFromRibbon(page, 'insert'), 'Entire row')
  await expect(cell(page, '1:0')).toHaveText('')
  await expect(cell(page, '2:0')).toHaveText('SO-10001')
  await undo(page).click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})
