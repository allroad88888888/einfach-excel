import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { selectText, cell } from '../support/rich-baseline'

for (const [label, key, value] of [['上标', 'Enter', 'superscript'], ['下标', 'Space', 'subscript']]) {
  test(`Chinese inline ${value} activates with ${key} on a narrow viewport`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 850 })
    await page.goto('/?plugins=text-format&locale=zh')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const name = page.getByRole('textbox', { name: '名称框', exact: true })
    await name.fill('D8'); await name.press('Enter')
    await showRibbonItem(page, 'format.rich-text')
    await page.getByRole('button', { name: '富文本', exact: true }).click()
    const panel = page.getByRole('dialog', { name: /^富文本/ })
    const editor = panel.getByRole('textbox', { name: '单元格文字', exact: true })
    const tool = panel.getByRole('button', { name: label, exact: true })
    await expect(tool).toBeDisabled()
    await selectText(editor, 0, 1)
    // Traverse the real tab order from textarea, rather than focusing the target directly.
    for (let i = 0; i < 8 && !(await tool.evaluate(node => node === document.activeElement)); i++)
      await page.keyboard.press('Tab')
    await expect(tool).toBeFocused(); await page.keyboard.press(key)
    await expect(editor).toBeFocused()
    await expect(tool).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: info.outputPath(`rich-${value}-zh.png`) })
    await panel.getByRole('button', { name: '保存更改', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect(cell(page, '7:3')).toHaveText('x2')
    // The adjacent character keeps its original superscript.
    const runs = cell(page, '7:3').locator('.cell-content > span')
    if (value === 'superscript') await expect(runs).toHaveText(['x2'])
    else {
      await expect(runs.nth(0)).toHaveAttribute('data-font-baseline', 'subscript')
      await expect(runs.nth(1)).toHaveAttribute('data-font-baseline', 'superscript')
    }
    await expect(cell(page, '7:2')).toHaveText('Inline exponent')
  })
}
