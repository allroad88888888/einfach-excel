import { expect, type Page } from '@playwright/test'
import { openDateFile } from './conditional-dates'
import { button, cell, go, menu } from './date-filter'
import { showRibbonItem } from './ribbon'

const records = [
  ['Alpha', 8, 45351], ['alpha', 8, 45351], ['Alpine', 10, 45352], ['Beta', 1, 45353],
  ['Betamax', 6, 45354], ['Qx*', 4, 45355], ['QxZ', 6, 45356],
] as const

function nativeCell(sheet: number, row: number, col: number, value: string | number,
  kind = typeof value === 'number' ? 'number' : 'text') {
  return { sheet, row, col, addr: `${String.fromCharCode(65 + col)}${row + 1}`, kind, value }
}

export const criteriaFixture = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Worksheet criteria records',
  canvases: Array.from({ length: 3 }, () => ({ rowCount: 36, colCount: 8 })),
  workbook: {
    version: 1, sheets: ['Source records', 'Filter Rules', 'Copied rows'].map((name, idx) => ({ idx, name })),
    cells: [
      ...['Name', 'Score', 'Day'].map((name, col) => nativeCell(0, 0, col, name)),
      ...records.flatMap((record, row) => record.map((value, col) => nativeCell(0, row + 1, col, value))),
      nativeCell(0, 9, 0, 'Outside'),
      ...['name', 'Score', 'Score'].map((name, col) => nativeCell(1, 0, col, name)),
      ...['ALP', '>=4', '<=9'].map((value, col) => nativeCell(1, 1, col, value)),
      nativeCell(1, 2, 0, '=Beta'), nativeCell(1, 3, 0, 'Q?~*'),
      nativeCell(1, 0, 4, 'Formula matches'),
      nativeCell(1, 1, 4, "='Source records'!B2>=$H$1", 'formula'),
      nativeCell(1, 0, 7, 6),
      nativeCell(2, 1, 3, 'Occupied'), nativeCell(2, 6, 3, 'Outside output'),
    ],
    formats: [{ sheet: 0, startRow: 1, endRow: 7, startCol: 2, endCol: 2,
      cellStyles: records.map((_, row) => ({ addr: `C${row + 2}`,
        format: { numberFormat: { kind: 'date', pattern: 'yyyy-mm-dd' } } })) }],
  },
}))

export const criteriaDialog = (page: Page, name = 'Advanced filter') =>
  page.getByRole('dialog', { name, exact: true })

export async function launchCriteria(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/?plugins=data-filter&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, criteriaFixture)
  await expect(cell(page, '1:0')).toHaveText('Alpha')
}

export async function openCriteria(page: Page, range = "'Filter Rules'!A1:C4") {
  await go(page, 'A1:C8')
  await showRibbonItem(page, 'data.advanced-filter-range')
  await button(page, 'Advanced filter').click()
  const dialog = criteriaDialog(page)
  await expect(dialog.getByLabel('List range', { exact: true })).toHaveValue('A1:C8')
  await dialog.getByLabel('Criteria range', { exact: true }).fill(range)
  return dialog
}

export async function checkRecords(page: Page, visible: readonly number[]) {
  await go(page, 'A1')
  for (const [index, [name]] of records.entries()) {
    const record = cell(page, `${index + 1}:0`)
    if (visible.includes(index + 1)) await expect(record).toHaveText(name)
    else await expect(record).toHaveCount(0)
  }
  await expect(cell(page, '0:0')).toHaveText('Name')
  await expect(cell(page, '9:0')).toHaveText('Outside')
}

export async function reapplyCriteria(page: Page) {
  await showRibbonItem(page, 'data.worksheet-filter')
  await menu(page).selectOption('reapply')
}
