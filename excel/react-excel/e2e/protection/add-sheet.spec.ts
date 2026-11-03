import { expect, test } from '@playwright/test'
import { button, cell, editor, input, select } from './support'

for (const width of [1280, 390]) {
  for (const initialSheet of ['Sales Orders', '整表只读']) {
    test(`add sheet with protected neighbors supports input undo and redo from ${initialSheet} at ${width}px`,
      async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?locale=en')
        const tabs = page.locator('.sheet-tab')
        const locked = page.getByRole('tab', { name: '整表只读', exact: true })
        await expect(locked).toHaveAttribute('data-read-only', 'true')
        await page.getByRole('tab', { name: initialSheet, exact: true }).click()
        await expect(button(page, 'Undo')).toBeDisabled()
        await button(page, 'New sheet').click()
        const added = page.getByRole('tab', { name: 'Sheet5', exact: true })
        await expect(added).toHaveAttribute('aria-selected', 'true')
        await expect(tabs).toHaveCount(5)
        await expect(page.locator('[data-sheet-command-error]')).toHaveCount(0)
        await expect(editor(page)).toBeEditable()
        await input(page, '42')
        await expect(cell(page, '0:0')).toHaveText('42')
        await button(page, 'Undo').click()
        await expect(cell(page, '0:0')).toHaveText('')
        await button(page, 'Undo').click()
        await expect(added).toHaveCount(0)
        await expect(tabs).toHaveCount(4)
        await expect(locked).toHaveAttribute('data-read-only', 'true')
        await button(page, 'Redo').click()
        await expect(added).toBeVisible()
        await added.click()
        await expect(cell(page, '0:0')).toHaveText('')
        await button(page, 'Redo').click()
        await expect(cell(page, '0:0')).toHaveText('42')
        await locked.click()
        await select(page, 'B6', '5:1')
        await expect(cell(page, '5:1')).toHaveText('2')
        await cell(page, '5:1').dblclick()
        const warning = page.getByRole('alertdialog', { name: 'This worksheet is protected.' })
        await expect(warning).toBeVisible()
        await warning.getByRole('button', { name: 'OK', exact: true }).click()
        await expect(editor(page)).not.toBeEditable()
        await page.getByRole('tab', { name: '局部可编辑', exact: true }).click()
        await select(page, 'B6', '5:1')
        await input(page, '3')
        await expect(cell(page, '5:1')).toHaveText('3')
        await select(page, 'D11', '10:3')
        await expect(cell(page, '10:3')).toHaveText('5,120.00')
        await expect(editor(page)).not.toBeEditable()
        await expect(locked).toHaveAttribute('data-read-only', 'true')
      },
    )
  }
}
