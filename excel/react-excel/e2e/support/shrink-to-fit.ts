import { expect, type Locator, type Page } from '@playwright/test'
import { showRibbonItem } from './ribbon'
import { baselineGlyphBox } from './font-baseline'

export const shrinkText = (cell: Locator) => cell.locator('[data-shrink-to-fit]')
export const shrinkScale = async (cell: Locator) => Number(await shrinkText(cell).getAttribute('data-shrink-scale'))

export async function toggleShrink(page: Page) {
  await showRibbonItem(page, 'format.shrink-to-fit')
  await page.getByRole('button', { name: 'Shrink to fit', exact: true }).click()
}

export async function setShrinkColumnWidth(page: Page, width: number) {
  await showRibbonItem(page, 'view.row-and-column-size')
  await page.getByRole('button', { name: 'Row and column size', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Column width' }).fill(String(width))
  await page.getByRole('button', { name: 'Set column width', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/** Compare actual text-node extents with the content box, excluding reserved UI space. */
export async function expectShrinkFits(cell: Locator) {
  await expect.poll(() => shrinkScale(cell)).toBeGreaterThan(0)
  const glyph = await baselineGlyphBox(cell)
  const clip = await cell.locator('.cell-content').evaluate(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
    const zoom = rect.width / (Number.parseFloat(style.width) || rect.width)
    return { left: rect.left + Number.parseFloat(style.paddingLeft) * zoom,
      right: rect.right - Number.parseFloat(style.paddingRight) * zoom }
  })
  expect(glyph.x).toBeGreaterThanOrEqual(clip.left - 0.5)
  expect(glyph.x + glyph.width).toBeLessThanOrEqual(clip.right + 0.5)
  return glyph
}
