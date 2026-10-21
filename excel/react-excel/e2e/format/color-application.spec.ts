import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

// 按实际入口验收颜色写入；色板取消、继承、等待态等交叉回归留在 color-palette.spec.ts。
const cases = [
  { kind: 'fill', mode: 'preset', hex: '#93c47d', rgb: 'rgb(147, 196, 125)' },
  { kind: 'text', mode: 'preset', hex: '#434343', rgb: 'rgb(67, 67, 67)' },
  { kind: 'fill', mode: 'hex', hex: '#ABCDEF', rgb: 'rgb(171, 205, 239)' },
  { kind: 'text', mode: 'hex', hex: '#102030', rgb: 'rgb(16, 32, 48)' },
  { kind: 'fill', mode: 'picker', hex: '#123456', rgb: 'rgb(18, 52, 86)' },
  { kind: 'text', mode: 'picker', hex: '#6fa8dc', rgb: 'rgb(111, 168, 220)' },
] as const

for (const width of [1280, 390]) test.describe(`${width}px color application`, () => {
  test.use({ viewport: { width, height: 850 } })

  for (const entry of cases) test(`${entry.kind} ${entry.mode} color preserves other fields and undoes once at ${width}px`, async ({ page }) => {
    await page.goto('/')
    const target = await select(page, 'A2', '1:0')
    await expect(target).toHaveText('SO-10001')
    const property = entry.kind === 'fill' ? 'background-color' : 'color'
    const other = entry.kind === 'fill' ? 'color' : 'background-color'
    const before = await target.evaluate(
      (node, key) => getComputedStyle(node).getPropertyValue(key), property,
    )
    const preserved = await target.evaluate(
      (node, key) => getComputedStyle(node).getPropertyValue(key), other,
    )
    const neighbor = cell(page, '2:0')
    const outside = await neighbor.evaluate(
      (node, key) => getComputedStyle(node).getPropertyValue(key), property,
    )
    const opener = button(page, `Choose ${entry.kind} color`)
    await opener.click()
    if (entry.mode === 'preset') await button(page, `Color ${entry.hex}`).click()
    else if (entry.mode === 'picker') {
      await page.getByLabel('Custom color picker').fill(entry.hex)
      await expect(page.getByRole('textbox', { name: 'Color hex' })).toHaveValue(entry.hex)
      await expect(target).toHaveCSS(property, before)
      await expect(button(page, 'Undo')).toBeDisabled()
      await button(page, 'Apply').click()
    } else {
      const hex = page.getByRole('textbox', { name: 'Color hex' })
      await hex.fill('#xyz123'); await button(page, 'Apply').click()
      await expect(page.getByRole('alert')).toContainText('six-digit')
      await expect(hex).toHaveAttribute('aria-invalid', 'true')
      await expect(target).toHaveCSS(property, before)
      await expect(button(page, 'Undo')).toBeDisabled()
      await hex.fill(entry.hex); await button(page, 'Apply').click()
    }
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(opener).toBeFocused()
    await expect(target).toHaveCSS(property, entry.rgb)
    await expect(target).toHaveCSS(other, preserved)
    await expect(target).toHaveCSS('font-weight', '700')
    await expect(target).toHaveText('SO-10001')
    await expect(neighbor).toHaveCSS(property, outside)
    await expect(neighbor).toHaveText('SO-10002')
    await button(page, 'Undo').click()
    await expect(target).toHaveCSS(property, before)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(target).toHaveCSS(property, entry.rgb)
    await opener.click()
    await expect(page.getByRole('textbox', { name: 'Color hex' })).toHaveValue(entry.hex.toLowerCase())
  })
})
