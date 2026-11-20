import { expect, type Locator, type Page } from '@playwright/test'
import { showRibbonItem } from './ribbon'

export const diagonalCell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const diagonalButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const diagonalLines = (cell: Locator) => cell.locator('[data-diagonal]')
export const diagonalWorkbook = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Diagonals', canvases: [{ rowCount: 80, colCount: 16 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'Geometry', defaults: { rowHeight: 48, colWidth: 120 } }],
    cells: ['A1', 'B2', 'C2', 'B3', 'C3', 'E5'].map((addr, i) => ({
      sheet: 0, addr, row: Number(addr.slice(1)) - 1, col: addr.charCodeAt(0) - 65,
      kind: 'text', value: ['Diagonal fixture', 'B2 kept', 'C2 kept', 'B3 kept', 'C3 kept', 'Merged kept'][i],
    })), merges: [{ sheet: 0, ranges: [[4, 4, 5, 6]] }],
  },
}))

export async function openDiagonal(page: Page, preset: string, style = 'thin', color = '#c00000') {
  await showRibbonItem(page, 'format.border-settings')
  await diagonalButton(page, 'Border settings').click()
  await page.getByLabel('Position', { exact: true }).selectOption(preset)
  if (!['none', 'diagonal-none'].includes(preset)) {
    await page.getByLabel('Line style', { exact: true }).selectOption(style)
    await page.getByLabel('Hex color', { exact: true }).fill(color)
  }
}

export async function applyDiagonal(page: Page) {
  await diagonalButton(page, 'Apply borders').click()
  await expect(page.getByRole('dialog', { name: 'Borders', exact: true })).toHaveCount(0)
}

export async function expectDiagonalGeometry(cell: Locator, sides: readonly string[], count = 1) {
  const svg = cell.locator('[data-diagonal-borders]')
  await expect(svg).toHaveCount(sides.length ? 1 : 0)
  await expect(diagonalLines(cell)).toHaveCount(sides.length * count)
  if (!sides.length) return
  const [box, overlay] = await Promise.all([cell.boundingBox(), svg.boundingBox()])
  expect(Math.abs(box!.x - overlay!.x)).toBeLessThan(1.1)
  expect(Math.abs(box!.y - overlay!.y)).toBeLessThan(1.1)
  expect(Math.abs(box!.width - overlay!.width)).toBeLessThan(1.1)
  expect(Math.abs(box!.height - overlay!.height)).toBeLessThan(1.1)
  for (const side of sides) {
    const line = cell.locator(`[data-diagonal="${side}"]`).first()
    const y1 = Number(await line.getAttribute('y1')), y2 = Number(await line.getAttribute('y2'))
    expect(side === 'diagDown' ? y2 > y1 : y2 < y1).toBe(true)
  }
}
