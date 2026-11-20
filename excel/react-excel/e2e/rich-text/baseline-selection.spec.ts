import { expect, test } from '@playwright/test'
import { downloadDateFile } from '../support/conditional-dates'
import { start, open, selectText, text, dialog, button, save, cell, boxes } from '../support/rich-baseline'

test('mixed inline baselines toggle to explicit normal while Reset restores cell inheritance', async ({ page }) => {
  await start(page); await open(page, 'D11'); await selectText(text(page), 0, 2)
  for (const name of ['Superscript', 'Subscript'])
    await expect(button(dialog(page), name)).toHaveAttribute('aria-pressed', 'mixed')
  await button(dialog(page), 'Subscript').click()
  await expect(button(dialog(page), 'Subscript')).toHaveAttribute('aria-pressed', 'true')
  await button(dialog(page), 'Subscript').click(); await save(page)
  await expect(cell(page, '10:3').locator('[data-font-baseline="normal"]')).toHaveText('AB')
  const saved = JSON.parse((await downloadDateFile(page)).toString()).workbook
  expect(saved.richText.find((entry: { row: number; col: number }) => entry.row === 10 && entry.col === 3).runs)
    .toEqual([{ text: 'AB', format: { fontBaseline: 'normal' } }])
  await button(page, 'Undo').click()
  await expect(cell(page, '10:3').locator('[data-font-baseline="normal"]')).toHaveText('B')
  await open(page, 'D11'); await selectText(text(page), 0, 2)
  await button(dialog(page), 'Reset selected formatting').click(); await save(page)
  await expect(cell(page, '10:3').locator('[data-font-baseline="superscript"]')).toHaveText('AB')
  await button(page, 'Undo').click()
  await expect(cell(page, '10:3').locator('.cell-content > span')).toHaveCount(2)
  const [a, b] = await boxes(cell(page, '10:3'))
  expect(a.height).toBeLessThan(b.height * 0.85)
})

test('inline baseline selection keeps emoji intact and survives subsequent insertion and deletion', async ({ page }) => {
  await start(page); await open(page, 'D8')
  await text(page).fill('A😀x2B'); await selectText(text(page), 1, 1)
  await button(dialog(page), 'Subscript').click()
  await text(page).press('End'); await text(page).press('Backspace'); await text(page).press('!')
  await save(page)
  const target = cell(page, '7:3')
  await expect(target).toHaveText('A😀x2!')
  await expect(target.locator('[data-font-baseline="subscript"]')).toHaveText('😀')
  await open(page, 'D8'); await selectText(text(page), 1, 1)
  await expect(button(dialog(page), 'Subscript')).toHaveAttribute('aria-pressed', 'true')
  await button(dialog(page), 'Cancel').click(); await button(page, 'Undo').click()
  await expect(target).toHaveText('x2')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('Escape drops inline baseline changes and keeps redo available', async ({ page }) => {
  await start(page); await open(page, 'D8'); await selectText(text(page), 1, 1)
  await button(dialog(page), 'Subscript').click(); await save(page)
  await button(page, 'Undo').click(); await open(page, 'D8'); await selectText(text(page), 0, 2)
  await button(dialog(page), 'Superscript').click(); await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(button(page, 'Redo')).toBeEnabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '7:3').locator('[data-font-baseline="subscript"]')).toHaveText('2')
})
