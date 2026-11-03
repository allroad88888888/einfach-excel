import { expect, test } from '@playwright/test'
import { chooseTabMenu, tab, tabs } from '../sheet-management/support'
import { button, cell, expectReadOnlyDemo, input, openProtectedDemo } from './support'

for (const width of [1280, 390]) {
  test(`right-click Delete removes a new sheet with protected neighbors and replays history at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await button(page, 'New sheet').click()
    await input(page, '42')
    await chooseTabMenu(page, 'Sheet5', 'Delete sheet')
    const dialog = page.getByRole('alertdialog', { name: 'Delete worksheet?' })
    await dialog.getByRole('button', { name: 'Delete worksheet', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(tab(page, 'Sheet5')).toHaveCount(0)
    await expect(tabs(page)).toHaveCount(4)
    await button(page, 'Undo').click()
    await tab(page, 'Sheet5').click()
    await expect(cell(page, '0:0')).toHaveText('42')
    await button(page, 'Redo').click()
    await expect(tab(page, 'Sheet5')).toHaveCount(0)
    await expectReadOnlyDemo(page)
  })

  test(`right-click Delete restores a protected sheet with its locks on undo at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, '整表只读', 'Delete sheet')
    const dialog = page.getByRole('alertdialog', { name: 'Delete worksheet?' })
    await dialog.getByRole('button', { name: 'Delete worksheet', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(tab(page, '整表只读')).toHaveCount(0)
    await button(page, 'Undo').click()
    await expectReadOnlyDemo(page)
    await cell(page, '5:1').dblclick()
    const warning = page.getByRole('alertdialog', { name: 'This worksheet is protected.' })
    await expect(warning).toBeVisible()
    await warning.getByRole('button', { name: 'OK', exact: true }).click()
    await button(page, 'Redo').click()
    await expect(tab(page, '整表只读')).toHaveCount(0)
    await tab(page, 'Sales Orders').click()
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
  })

  test(`deleting Sales Orders with protected neighbors rewrites Summary and undo restores it at ${width}px`, async ({ page }) => {
    await openProtectedDemo(page, width)
    await chooseTabMenu(page, 'Sales Orders', 'Delete sheet')
    const dialog = page.getByRole('alertdialog', { name: 'Delete worksheet?' })
    await dialog.getByRole('button', { name: 'Delete worksheet', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await tab(page, 'Summary').click()
    await expect(cell(page, '0:1')).toHaveText('#REF!')
    await button(page, 'Undo').click()
    await tab(page, 'Summary').click()
    await expect(cell(page, '0:1')).toHaveText('79')
    await expectReadOnlyDemo(page)
  })
}
