import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

// 合并确认的退出与键盘入口，保留原生多格内容及重做分支。
for (const width of [1280, 390]) for (const action of ['Cancel', 'Escape', 'Tab', 'Shift+Tab', 'Open'] as const)
  test(`${action} merge confirmation preserves content focus and redo at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await select(page, 'H2', '1:7')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await bar.fill('Keep merge redo')
    await bar.press('Enter')
    await expect(page.locator('td[data-cell="1:7"]')).toHaveText('Keep merge redo')
    await undo.click()
    await select(page, 'B2:C3', '1:1')
    const coords = ['1:1', '1:2', '2:1', '2:2', '1:3']
    const values = await Promise.all(coords.map(coord => page.locator(`td[data-cell="${coord}"]`).innerText()))
    const menu = page.getByRole('combobox', { name: 'Merge cells', exact: true })
    await menu.focus()
    await menu.selectOption('merge')
    const dialog = page.getByRole('alertdialog', { name: 'Merge these cells?', exact: true })
    const first = dialog.getByRole('button', { name: 'Cancel', exact: true })
    const last = dialog.getByRole('button', { name: 'Merge cells', exact: true })
    await expect(first).toBeFocused()
    await expect(menu).toBeDisabled()
    if (action === 'Tab' || action === 'Shift+Tab') {
      await (action === 'Tab' ? last : first).focus()
      await page.keyboard.press(action)
      await expect(action === 'Tab' ? first : last).toBeFocused()
    }
    if (action === 'Open') {
      await expect(dialog).toBeInViewport()
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath(`merge-dialog-${width}.png`) })
    }
    if (action === 'Escape') await page.keyboard.press('Escape')
    else await first.click()
    await expect(dialog).toHaveCount(0)
    await expect(menu).toBeFocused()
    await expect(menu).toBeEnabled()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B2:C3')
    await expect(page.locator('[data-merged-cell][data-cell="1:1"]')).toHaveCount(0)
    for (const [index, coord] of coords.entries())
      await expect(page.locator(`td[data-cell="${coord}"]`)).toHaveText(values[index]!)
    await expect(page.locator('td[data-cell="1:1"]')).toHaveCSS('font-style', 'italic')
    await expect(page.locator('td[data-cell="1:2"]')).toHaveCSS('text-decoration-line', 'underline')
    await expect(undo).toBeDisabled()
    await redo.click()
    await select(page, 'H2', '1:7')
    await expect(page.locator('td[data-cell="1:7"]')).toHaveText('Keep merge redo')
    await select(page, 'A2', '1:0')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveCSS('font-weight', '700')
  })
