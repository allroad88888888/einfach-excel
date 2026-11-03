import { expect, test } from '@playwright/test'
import { chooseTabMenu, menuItem, openTabMenu, tab, tabs } from '../sheet-management/support'
import {
  button, cell, editor, expectReadOnlyDemo, input, openProtectedDemo, select,
} from './support'

for (const width of [1280, 390]) {
  test(`right-click Hide works with protected demo sheets and undoes at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, 'Sales Orders', 'Hide')
    await expect(tab(page, 'Sales Orders')).toHaveCount(0)
    await expect(tab(page, 'Summary')).toHaveAttribute('aria-selected', 'true')
    await expect(cell(page, '0:1')).toHaveText('79')
    await expectReadOnlyDemo(page)
    await button(page, 'Undo').click()
    await expect(tab(page, 'Sales Orders')).toBeVisible()
    await button(page, 'Redo').click()
    await expect(tab(page, 'Sales Orders')).toHaveCount(0)
    await expectReadOnlyDemo(page)
  })

  test(`right-click Unhide restores a protected sheet without unlocking it at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, '整表只读', 'Hide')
    await expect(tab(page, '整表只读')).toHaveCount(0)
    await chooseTabMenu(page, 'Sales Orders', 'Unhide…')
    const dialog = page.getByRole('dialog', { name: 'Unhide worksheet' })
    await dialog.getByRole('option', { name: '整表只读', exact: true }).click()
    await dialog.getByRole('button', { name: 'OK', exact: true }).click()
    await expectReadOnlyDemo(page)
    await button(page, 'Undo').click()
    await expect(tab(page, '整表只读')).toHaveCount(0)
    await button(page, 'Redo').click()
    await expectReadOnlyDemo(page)
  })

  test(`right-click Rename works with protected demo sheets and preserves formulas at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, 'Sales Orders', 'Rename sheet')
    await page.getByRole('textbox', { name: 'Sheet name' }).fill('Renamed orders')
    await page.getByRole('textbox', { name: 'Sheet name' }).press('Enter')
    await expect(tab(page, 'Renamed orders')).toBeVisible()
    await tab(page, 'Summary').click()
    await select(page, 'B1', '0:1')
    await expect(editor(page)).toHaveValue(/Renamed orders/)
    await expect(cell(page, '0:1')).toHaveText('79')
    await button(page, 'Undo').click()
    await expect(tab(page, 'Sales Orders')).toBeVisible()
    await button(page, 'Redo').click()
    await expect(tab(page, 'Renamed orders')).toBeVisible()
    await expectReadOnlyDemo(page)
    await chooseTabMenu(page, '整表只读', 'Rename sheet')
    await page.getByRole('textbox', { name: 'Sheet name' }).fill('Locked renamed')
    await page.getByRole('textbox', { name: 'Sheet name' }).press('Enter')
    await expectReadOnlyDemo(page, 'Locked renamed')
    await button(page, 'Undo').click()
    await expectReadOnlyDemo(page)
    await expect(tab(page, 'Renamed orders')).toBeVisible()
  })

  for (const direction of ['left', 'right']) {
    test(`right-click Move ${direction} works on a protected sheet and undoes at ${width}px`, async ({ page }) => {
      await openProtectedDemo(page, width)
      const before = await tabs(page).allTextContents()
      await chooseTabMenu(page, '整表只读', `Move sheet ${direction}`)
      const after = [...before]
      after.splice(2, 1)
      after.splice(direction === 'left' ? 1 : 3, 0, '整表只读')
      await expect(tabs(page)).toHaveText(after)
      await expectReadOnlyDemo(page)
      await button(page, 'Undo').click()
      await expect(tabs(page)).toHaveText(before)
      await button(page, 'Redo').click()
      await expect(tabs(page)).toHaveText(after)
      await expectReadOnlyDemo(page)
    })
  }

  test(`right-click Duplicate preserves protected cells and editable ranges at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, '整表只读', 'Duplicate')
    await expectReadOnlyDemo(page, '整表只读 (2)')
    await button(page, 'Undo').click()
    await expect(tab(page, '整表只读 (2)')).toHaveCount(0)
    await button(page, 'Redo').click()
    await expectReadOnlyDemo(page, '整表只读 (2)')
    await chooseTabMenu(page, '局部可编辑', 'Duplicate')
    await expect(tab(page, '局部可编辑 (2)')).toHaveAttribute('aria-selected', 'true')
    await select(page, 'B6', '5:1')
    await input(page, '3')
    await select(page, 'D11', '10:3')
    await expect(cell(page, '10:3')).toHaveText('5,120.00')
    await expect(editor(page)).not.toBeEditable()
    await tab(page, '局部可编辑').click()
    await select(page, 'B6', '5:1')
    await expect(cell(page, '5:1')).toHaveText('2')
    await expectReadOnlyDemo(page)
  })

  test(`right-click Tab color works on a protected sheet and undoes at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, '整表只读', 'Tab color')
    await page.getByRole('group', { name: 'Tab color' }).getByRole('button', { name: 'Red', exact: true }).click()
    await expect(tab(page, '整表只读')).toHaveAttribute('data-tab-color', '#FF0000')
    await button(page, 'Undo').click()
    await expect(tab(page, '整表只读')).not.toHaveAttribute('data-tab-color', /.+/)
    await button(page, 'Redo').click()
    await expect(tab(page, '整表只读')).toHaveAttribute('data-tab-color', '#FF0000')
    await expectReadOnlyDemo(page)
  })

  test(`right-click No color clears a protected sheet tab color at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, '整表只读', 'Tab color')
    await page.getByRole('group', { name: 'Tab color' }).getByRole('button', { name: 'Red', exact: true }).click()
    await chooseTabMenu(page, '整表只读', 'Tab color')
    await button(page, 'No color').click()
    await expect(tab(page, '整表只读')).not.toHaveAttribute('data-tab-color', /.+/)
    await button(page, 'Undo').click()
    await expect(tab(page, '整表只读')).toHaveAttribute('data-tab-color', '#FF0000')
    await expectReadOnlyDemo(page)
  })

  test(`right-click New sheet works beside protected sheets at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, '整表只读', 'New sheet')
    await expect(tab(page, 'Sheet5')).toHaveAttribute('aria-selected', 'true')
    await input(page, '42')
    await expect(cell(page, '0:0')).toHaveText('42')
    await expectReadOnlyDemo(page)
  })

  test(`right-click Select all sheets includes protected sheets at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, 'Sales Orders', 'Select all sheets')
    await expect(page.locator('.sheet-tab[data-grouped="true"]')).toHaveCount(4)
    await expect(button(page, 'Undo')).toBeDisabled()
    await expect(page.locator('[data-sheet-command-error]')).toHaveCount(0)
  })

  test(`right-click Ungroup sheets clears protected sheet grouping at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, 'Sales Orders', 'Select all sheets')
    await openTabMenu(page, '整表只读')
    await menuItem(page, 'Ungroup sheets').click()
    await expect(page.locator('.sheet-tab[data-grouped="true"]')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    await expectReadOnlyDemo(page)
  })
}
