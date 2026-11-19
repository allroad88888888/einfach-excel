import { expect, type Page } from '@playwright/test'
import { openDateFile } from './conditional-dates'
import { button, cell, go } from './date-filter'
import { showRibbonItem } from './ribbon'

const rows = [
  ['Region', 'Product', 'Sales'],
  ['East', 'Bags', 2],
  ['East', 'Pens', 3],
  ['West', 'Bags', 4],
  ['West', 'Pens', 16],
] as const

export const subtotalFixture = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Subtotal records',
  canvases: [{ rowCount: 36, colCount: 8 }, { rowCount: 36, colCount: 8 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'List' }, { idx: 1, name: 'Report' }],
    cells: [
      ...rows.flatMap((values, row) => values.map((value, col) => ({
        sheet: 0, row, col, addr: `${String.fromCharCode(65 + col)}${row + 1}`,
        kind: typeof value === 'number' ? 'number' : 'text', value,
      }))),
      { sheet: 0, row: 8, col: 7, addr: 'H9', kind: 'text', value: 'Independent text' },
      { sheet: 1, row: 0, col: 0, addr: 'A1', kind: 'formula', value: '=List!C4' },
    ],
  },
}))

export async function launchSubtotal(page: Page) {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?plugins=data-subtotal&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, subtotalFixture)
  await expect(cell(page, '0:0')).toHaveText('Region')
}

export async function openSubtotal(page: Page, range = 'A1:C5') {
  await go(page, range)
  await showRibbonItem(page, 'data.subtotal')
  await button(page, 'Subtotal').click()
  const panel = page.getByRole('dialog', { name: 'Subtotal', exact: true })
  await expect(panel).toBeVisible()
  return panel
}

export async function applySubtotal(page: Page) {
  const panel = page.getByRole('dialog', { name: 'Subtotal', exact: true })
  await panel.getByRole('button', { name: 'Apply subtotals', exact: true }).click()
  await expect(panel).toHaveCount(0)
}
