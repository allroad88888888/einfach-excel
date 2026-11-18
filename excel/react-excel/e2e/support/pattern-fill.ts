import { expect, type Page } from '@playwright/test'
import { showRibbonItem } from './ribbon'

export const patternCell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const patternButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const patternWorkbookData = {
  format: 'einfach-workbook', version: 1, title: 'Patterns', canvases: [{ rowCount: 80, colCount: 16 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'Patterns', defaults: { rowHeight: 64, colWidth: 128 } }],
    cells: [
      { sheet: 0, addr: 'A1', row: 0, col: 0, kind: 'text', value: 'Pattern fixture' },
      { sheet: 0, addr: 'C2', row: 1, col: 2, kind: 'text', value: 'C2 kept' },
      { sheet: 0, addr: 'B3', row: 2, col: 1, kind: 'text', value: 'B3 kept' },
      { sheet: 0, addr: 'C3', row: 2, col: 2, kind: 'text', value: 'C3 kept' },
      { sheet: 0, addr: 'D2', row: 1, col: 3, kind: 'formula', value: '=25/2' },
    ],
    formats: [{ sheet: 0, startRow: 1, endRow: 1, startCol: 2, endCol: 3,
      cellStyles: [{ addr: 'C2', format: { fgColor: '#123abc', bold: true } },
        { addr: 'D2', format: { numberFormat: { kind: 'accounting', symbol: '$', digits: 2 }, shrinkToFit: true } }],
    }],
    merges: [{ sheet: 0, ranges: [[4, 4, 5, 6]] }],
  },
}
export const patternWorkbook = Buffer.from(JSON.stringify(patternWorkbookData))

export async function openPattern(page: Page, pattern?: string, foreground?: string, background?: string) {
  await showRibbonItem(page, 'format.pattern-fill')
  await patternButton(page, 'Pattern fill').click()
  if (pattern) await page.getByLabel('Pattern', { exact: true }).selectOption(pattern)
  if (foreground) await page.getByLabel('Pattern color', { exact: true }).fill(foreground)
  if (background) await page.getByLabel('Background color', { exact: true }).fill(background)
}
export async function applyPattern(page: Page) {
  await patternButton(page, 'Apply fill').click()
  await expect(page.getByRole('dialog', { name: 'Pattern fill', exact: true })).toHaveCount(0)
}
export async function expectPattern(page: Page, coord: string, pattern?: string, foreground = '#c00000') {
  const target = patternCell(page, coord)
  if (!pattern) { await expect(target).toHaveCSS('background-image', 'none'); return }
  await expect(target).toHaveCSS('background-image', /data:image\/svg\+xml/)
  expect(decodeURIComponent(await target.evaluate(node => getComputedStyle(node).backgroundImage)))
    .toContain(`fill="${foreground}"`)
}
