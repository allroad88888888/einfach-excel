import { expect, type Locator, type Page } from '@playwright/test'
import { showRibbonItem } from './ribbon'

export const baselineCell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const baselineButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

export async function applyBaseline(page: Page, value: 'Superscript' | 'Subscript', keyboard = false) {
  await showRibbonItem(page, `format.${value.toLowerCase()}`)
  const button = baselineButton(page, value)
  if (keyboard) { await button.focus(); await button.press('Enter') }
  else await button.click()
}

/** Range measures the actual glyph content box rather than the table cell or CSS declarations. */
export function baselineGlyphBox(cell: Locator) {
  return cell.evaluate(element => {
    const content = element.querySelector('.cell-content')!
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
    const boxes: DOMRect[] = []
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(walker.currentNode)
      boxes.push(range.getBoundingClientRect())
    }
    const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y))
    const right = Math.max(...boxes.map(box => box.right)), bottom = Math.max(...boxes.map(box => box.bottom))
    return { x, y, width: right - x, height: bottom - y, bottom }
  })
}

export async function startBaseline(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/?plugins=text-format')
  await expect(baselineCell(page, '1:0')).toHaveText('SO-10001')
}
