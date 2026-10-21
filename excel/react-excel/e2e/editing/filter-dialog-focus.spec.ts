import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

for (const width of [1280, 390]) for (const entry of ['toolbar', 'table column'])
  for (const action of ['Open', 'Tab', 'Shift+Tab'])
    test(`${action} ${entry} filter keeps native data and redo at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 850 })
      await page.goto('/e2e/fixtures/plain-sales-orders/')
      const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
      const button = (name: string) => page.getByRole('button', { name, exact: true })
      await expect(cell('1:0')).toHaveText('SO-10001')
      await select(page, 'E2', '1:4')
      const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
      await bar.fill('2')
      await bar.press('Enter')
      await expect(cell('1:6')).toHaveText('158')
      await button('Undo').click()
      const table = entry === 'table column'
      const menu = page.getByRole('combobox', { name: 'Worksheet filter', exact: true })
      let trigger = menu
      if (table) {
        await page.getByRole('tab', { name: 'Summary', exact: true }).click()
        await select(page, 'A80', '79:0')
        trigger = button('Filter DemoTable column B')
        await trigger.click()
      } else {
        await select(page, 'C2', '1:2')
        await menu.selectOption('open')
      }
      const dialog = page.getByRole('dialog', {
        name: table ? 'DemoTable filter conditions' : 'Filter conditions', exact: true,
      })
      const first = dialog.getByRole('combobox', {
        name: table ? 'Filter condition 1' : 'Filter column 1', exact: true,
      })
      const last = dialog.getByRole('button', { name: 'Cancel', exact: true })
      await expect(first).toBeFocused()
      if (table) await expect(dialog.getByLabel('Filter column 1', { exact: true })).toBeDisabled()
      if (action === 'Open') {
        expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
        await page.screenshot({ path: info.outputPath(`filter-${entry}-${width}.png`) })
      } else {
        await (action === 'Tab' ? last : first).focus()
        await page.keyboard.press(action)
        await expect(action === 'Tab' ? first : last).toBeFocused()
      }
      await last.click()
      await expect(dialog).toHaveCount(0)
      await expect(trigger).toBeFocused()
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(table ? 'A80' : 'C2')
      await expect(cell(table ? '80:1' : '1:2')).toHaveText(table ? '10' : 'North')
      await expect(cell(table ? '83:1' : '2:2')).toHaveText(table ? '60' : 'East')
      await expect(button('Undo')).toBeDisabled()
      await button('Redo').click()
      await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
      await select(page, 'E2', '1:4')
      await expect(cell('1:4')).toHaveText('2')
      await expect(cell('1:4')).toHaveCSS('color', 'rgb(192, 0, 0)')
      await expect(cell('1:6')).toHaveText('158')
      await expect(cell('1:6')).toHaveCSS('font-family', 'Georgia')
      await expect(cell('1:5')).toHaveText('79')
    })
