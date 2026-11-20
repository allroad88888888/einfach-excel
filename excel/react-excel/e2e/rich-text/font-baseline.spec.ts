import { expect, test } from '@playwright/test'
import { start, open, selectText, text, dialog, button, save, cell, boxes } from '../support/rich-baseline'

for (const width of [1280, 390]) {
  test(`Superscript formats only selected characters and survives reopen with one undo at ${width}px`, async ({ page }, info) => {
    await start(page, width); await open(page, 'D9'); await selectText(text(page), 1, 1)
    await button(dialog(page), 'Superscript').click()
    await expect(text(page)).toBeFocused()
    expect(await text(page).evaluate(node => {
      const input = node as HTMLTextAreaElement
      return [input.selectionStart, input.selectionEnd]
    })).toEqual([1, 2])
    await page.screenshot({ path: info.outputPath(`rich-superscript-${width}.png`) })
    await save(page)
    const target = cell(page, '8:3')
    await expect(target).toHaveText('H2O')
    await expect(target.locator('[data-font-baseline="superscript"]')).toHaveText('2')
    const [h, two, o] = await boxes(target)
    expect(two.height).toBeLessThan(h.height * 0.85)
    expect(two.center).toBeLessThan(h.center - 1)
    expect(o.height).toBeCloseTo(h.height, 1)
    await expect(cell(page, '8:2')).toHaveText('Inline subscript')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('H2O')
    await open(page, 'D9'); await selectText(text(page), 1, 1)
    await expect(button(dialog(page), 'Superscript')).toHaveAttribute('aria-pressed', 'true')
    await button(dialog(page), 'Cancel').click()
    await button(page, 'Undo').click()
    await expect(target.locator('[data-font-baseline="subscript"]')).toHaveText('2')
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(target.locator('[data-font-baseline="superscript"]')).toHaveText('2')
  })

  test(`Subscript replaces selected superscript without changing source text at ${width}px`, async ({ page }) => {
    await start(page, width); await open(page, 'D8'); await selectText(text(page), 1, 1)
    await button(dialog(page), 'Subscript').click(); await save(page)
    const target = cell(page, '7:3')
    await expect(target).toHaveText('x2')
    await expect(target.locator('[data-font-baseline="subscript"]')).toHaveText('2')
    const [x, two] = await boxes(target)
    expect(two.height).toBeLessThan(x.height * 0.85)
    expect(two.center).toBeGreaterThan(x.center)
    await expect(cell(page, '7:2')).toHaveText('Inline exponent')
    await button(page, 'Undo').click()
    await expect(target.locator('[data-font-baseline="superscript"]')).toHaveText('2')
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(target.locator('[data-font-baseline="subscript"]')).toHaveText('2')
  })
}
