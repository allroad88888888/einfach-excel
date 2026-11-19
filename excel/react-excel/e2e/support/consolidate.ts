import { expect, type Locator, type Page } from '@playwright/test'
import { openDateFile } from './conditional-dates'
import { button, cell, go } from './date-filter'
import { showRibbonItem } from './ribbon'

function makeCells(sheet: number, rows: readonly (readonly (string | number)[])[]) {
  return rows.flatMap((values, row) =>
    values.map((value, col) => ({
      sheet,
      row,
      col,
      addr: `${String.fromCharCode(65 + col)}${row + 1}`,
      kind: typeof value === 'number' ? 'number' : 'text',
      value,
    })),
  )
}

export const consolidateFixture = Buffer.from(
  JSON.stringify({
    format: 'einfach-workbook',
    version: 1,
    title: 'Consolidate sales',
    canvases: [
      { rowCount: 30, colCount: 10 },
      { rowCount: 30, colCount: 10 },
      { rowCount: 30, colCount: 10 },
    ],
    workbook: {
      version: 1,
      sheets: [
        { idx: 0, name: 'Q1' },
        { idx: 1, name: 'Q2' },
        { idx: 2, name: 'Summary' },
      ],
      cells: [
        ...makeCells(0, [
          ['Item', 'Sales', 'Units'],
          ['Apples', 10, 2],
          ['Oranges', 20, 4],
        ]),
        ...makeCells(1, [
          ['Item', 'UNITS', 'sales'],
          ['oranges', 6, 30],
          ['Bananas', 5, 15],
        ]),
        { sheet: 2, row: 0, col: 5, addr: 'F1', kind: 'text', value: 'Existing' },
        { sheet: 2, row: 1, col: 5, addr: 'F2', kind: 'number', value: 99 },
      ],
    },
  }),
)

export async function launchConsolidate(page: Page) {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?plugins=data-consolidate&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, consolidateFixture)
  await expect(cell(page, '0:0')).toHaveText('Item')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:5')).toHaveText('Existing')
}

export async function openConsolidate(page: Page, destination = 'A1') {
  await go(page, destination)
  await showRibbonItem(page, 'data.consolidate')
  await button(page, 'Consolidate').click()
  const panel = page.getByRole('dialog', { name: 'Consolidate', exact: true })
  await expect(panel).toBeVisible()
  return panel
}

export async function addReference(panel: Locator, reference: string) {
  await panel.getByLabel('Reference', { exact: true }).fill(reference)
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
}
