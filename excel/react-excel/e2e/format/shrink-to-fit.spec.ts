import { expect, test, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { select } from '../support/clipboard'
import { baselineGlyphBox, baselineCell as cell, baselineButton as button,
  startBaseline } from '../support/font-baseline'

async function start(page: Page) {
  await startBaseline(page)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await page.evaluate(() => document.fonts.ready)
}
async function layout(page: Page, kind: 'shrink-to-fit' | 'wrap-text') {
  await showRibbonItem(page, `format.${kind}`)
  await button(page, kind === 'shrink-to-fit' ? 'Shrink to fit' : 'Wrap text').click()
}
const scaled = (page: Page, coord: string) => cell(page, coord).locator('[data-shrink-to-fit]')

test('Shrink to fit preserves the stored font size and turns off wrapping in one undoable step', async ({ page }, info) => {
  await start(page); await select(page, 'E16', '15:4')
  const source = await page.getByRole('textbox', { name: 'Active cell value' }).inputValue()
  const before = await baselineGlyphBox(cell(page, '15:4'))
  const neighbor = await baselineGlyphBox(cell(page, '15:3'))
  await layout(page, 'wrap-text')
  await layout(page, 'shrink-to-fit')
  await expect(scaled(page, '15:4')).toHaveAttribute('data-shrink-scale', /0\./)
  await expect(cell(page, '15:4')).toHaveCSS('white-space', 'nowrap')
  const after = await baselineGlyphBox(cell(page, '15:4'))
  expect(after.height).toBeLessThan(before.height * 0.8)
  const content = await cell(page, '15:4').locator('.cell-content').boundingBox()
  expect(after.width).toBeLessThanOrEqual(content!.width + 0.5)
  expect((await baselineGlyphBox(cell(page, '15:3'))).width).toBeCloseTo(neighbor.width, 1)
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(source)
  await showRibbonItem(page, 'format.font-size')
  await expect(page.getByRole('combobox', { name: 'Font size', exact: true })).toHaveValue('16')
  await expect(cell(page, '15:4')).toHaveCSS('font-size', '16px')
  await button(page, 'Undo').click()
  await expect(scaled(page, '15:4')).toHaveCount(0)
  await expect(cell(page, '15:4')).toHaveCSS('white-space', 'pre-wrap')
  await button(page, 'Redo').click()
  await expect(scaled(page, '15:4')).toHaveAttribute('data-shrink-scale', /0\./)
  await page.screenshot({ path: info.outputPath('shrink-layout.png') })
})

test('Wrap text disables shrink to fit and undo restores the previous layout', async ({ page }) => {
  await start(page); await select(page, 'D16', '15:3')
  await expect(scaled(page, '15:3')).toHaveAttribute('data-shrink-scale', /0\./)
  const before = await baselineGlyphBox(cell(page, '15:3'))
  await layout(page, 'wrap-text')
  await expect(scaled(page, '15:3')).toHaveCount(0)
  await expect(cell(page, '15:3')).toHaveCSS('white-space', 'pre-wrap')
  await expect(scaled(page, '15:4')).toHaveCount(0)
  await expect(cell(page, '15:4')).toHaveCSS('white-space', 'nowrap')
  await button(page, 'Undo').click()
  await expect(scaled(page, '15:3')).toHaveAttribute('data-shrink-scale', /0\./)
  expect((await baselineGlyphBox(cell(page, '15:3'))).width).toBeCloseTo(before.width, 1)
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(scaled(page, '15:3')).toHaveCount(0)
  await expect(cell(page, '15:3')).toHaveCSS('white-space', 'pre-wrap')
})

test('native shrink examples retain numeric formulas and mixed run sizes beside plain references', async ({ page }) => {
  await start(page)
  for (const row of [11, 15, 16, 17]) {
    await select(page, `D${row + 1}`, `${row}:3`)
    await expect(scaled(page, `${row}:3`)).toHaveAttribute('data-shrink-scale', /0\./)
    await expect(scaled(page, `${row}:4`)).toHaveCount(0)
    await expect(cell(page, `${row}:3`)).toHaveText(await cell(page, `${row}:4`).textContent() ?? '')
  }
  await select(page, 'D18', '17:3')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=D17*2')
  await expect(cell(page, '17:3')).toHaveText('246913578.50')
  await select(page, 'D12', '11:3')
  await expect(cell(page, '11:3').locator('[data-font-baseline="subscript"]')).toHaveText('2')
  const glyph = await baselineGlyphBox(cell(page, '11:3'))
  const reference = await baselineGlyphBox(cell(page, '11:4'))
  expect(glyph.width).toBeLessThan(reference.width)
  await expect(button(page, 'Undo')).toBeDisabled()
})
