import { expect, test } from '@playwright/test'
import { button, editor } from './support'

const views = [
  { width: 1280, renderer: 'dom' },
  { width: 390, renderer: 'dom' },
  { width: 1280, renderer: 'canvas' },
] as const
const entries = [
  { name: 'double-click', close: 'OK' },
  { name: 'F2', close: 'Escape' },
  { name: 'typing', close: 'Enter' },
] as const

for (const { width, renderer } of views) test.describe(`${width}px ${renderer} protection warning`, () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })
  for (const entry of entries) test(
    `${entry.name} opens a protection dialog and ${entry.close} restores cell focus at ${width}px ${renderer}`,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/?locale=en&renderer=${renderer}`)
      await page.getByRole('tab', { name: '整表只读', exact: true }).click()
      const name = page.getByRole('textbox', { name: 'Name box', exact: true })
      await name.fill('B6')
      await name.press('Enter')
      const grid = page.locator('[data-workbook-grid]')
      await expect(grid).toHaveAttribute('data-projection-retained', 'false')
      await expect(editor(page)).toHaveValue('2')
      const bounds = await grid.boundingBox()
      const warning = page.getByRole('alertdialog', { name: 'This worksheet is protected.', exact: true })
      await expect(warning).toHaveCount(0)
      if (entry.name === 'double-click') {
        if (renderer === 'canvas') await grid.dblclick({ position: { x: 224, y: 187 } })
        else await page.locator('td[data-cell="5:1"]').dblclick()
      } else await grid.press(entry.name === 'typing' ? '9' : 'F2')
      await expect(warning).toBeVisible()
      await expect(warning).toContainText('To edit this cell, unprotect the worksheet first.')
      expect(await warning.evaluate(el => el.matches(':modal'))).toBe(true)
      const ok = warning.getByRole('button', { name: 'OK', exact: true })
      await expect(ok).toBeFocused()
      await ok.press('Tab')
      await expect(ok).toBeFocused()
      await ok.press('Shift+Tab')
      await expect(ok).toBeFocused()
      expect(await grid.boundingBox()).toEqual(bounds)
      await expect(page.locator('.formula-edit-feedback')).toHaveCount(0)
      await expect(page.locator('[data-cell-editor]')).toHaveCount(0)
      await page.mouse.click(5, 5)
      await expect(warning).toBeVisible()
      if (entry.close === 'OK') await ok.click()
      else await ok.press(entry.close)
      await expect(warning).toHaveCount(0)
      await expect(grid).toBeFocused()
      await expect(name).toHaveValue('B6')
      await expect(editor(page)).toHaveValue('2')
      expect(await grid.boundingBox()).toEqual(bounds)
      await expect(button(page, 'Undo')).toBeDisabled()
      await button(page, 'Copy').click()
      await expect(page.getByLabel('Clipboard status')).toContainText('Copied')
      await expect(warning).toHaveCount(0)
      // 每次尝试都重新提示；关闭旧提示不会保留草稿或重复提交。
      await grid.press('F2')
      await expect(warning).toBeVisible()
      await warning.getByRole('button', { name: 'OK', exact: true }).click()
      await expect(grid).toBeFocused()
      await grid.press('ArrowDown')
      await expect(name).toHaveValue('B7')
      await expect(editor(page)).toHaveValue('1')
      await expect(warning).toHaveCount(0)
    },
  )
})
