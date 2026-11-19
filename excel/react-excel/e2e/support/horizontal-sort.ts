import { expect, type Page } from '@playwright/test'
import { select } from './clipboard'
import { openDateFile } from './conditional-dates'
import { button, cell } from './date-filter'
import { showRibbonItem } from './ribbon'

export const original = ['alpha', 'hidden', 'first tie', 'low', 'second tie']
const scores = [3, 99, 2, '=3-2', 2]
const ranks = [4, 0, 2, 1, 3]
const fixture = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Horizontal records',
  canvases: [{ rowCount: 40, colCount: 8 }],
  workbook: {
    version: 1, sheets: [{ idx: 0, name: 'Horizontal' }],
    cells: [
      ...original.flatMap((value, col) => {
        const letter = String.fromCharCode(65 + col)
        const score = scores[col]
        return [
          { sheet: 0, addr: `${letter}1`, row: 0, col,
            kind: typeof score === 'number' ? 'number' : 'formula', value: score },
          { sheet: 0, addr: `${letter}2`, row: 1, col, kind: 'text', value },
          { sheet: 0, addr: `${letter}3`, row: 2, col, kind: 'number', value: ranks[col] },
        ]
      }),
      { sheet: 0, addr: 'D4', row: 3, col: 3, kind: 'text', value: 'Outside' },
    ],
    formats: [{ sheet: 0, startRow: 1, endRow: 1, startCol: 0, endCol: 4, cellStyles: [
      { addr: 'D2', format: { bgColor: '#c00000' } },
      { addr: 'E2', format: { bgColor: '#00ff00' } },
    ] }],
  },
}))

export const horizontalDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Sort left to right', exact: true })

export async function launchHorizontal(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/?plugins=data-sort&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, fixture)
  await expect(cell(page, '1:0')).toHaveText(original[0])
}

export async function openHorizontal(page: Page, range = 'A1:E3', anchor = '0:0') {
  await select(page, range, anchor)
  await showRibbonItem(page, 'data.sort-left-to-right')
  await button(page, 'Sort left to right').click()
  await expect(horizontalDialog(page)).toBeVisible()
}

export async function applyHorizontal(page: Page) {
  await horizontalDialog(page).getByRole('button', { name: 'Apply sort', exact: true }).click()
  await expect(horizontalDialog(page)).toHaveCount(0)
}

export async function expectRecords(page: Page, expected: readonly string[]) {
  for (const [col, record] of expected.entries()) await expect(cell(page, `1:${col}`)).toHaveText(record)
  await expect(cell(page, '3:3')).toHaveText('Outside')
}
