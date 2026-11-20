import { expect, type Page } from '@playwright/test'
import { openDateRules, dateButton as button } from './conditional-dates'

export async function addAverageRule(page: Page, range: string,
  direction: 'above' | 'below' = 'above', equal = false, fill = '#00ff00') {
  await openDateRules(page)
  await page.getByLabel('Applies to', { exact: true }).fill(range)
  await page.getByLabel('Rule type').selectOption('above-average')
  await page.getByLabel('Average comparison').selectOption(direction)
  await page.getByLabel('Include equal average').setChecked(equal)
  await page.getByLabel('Highlight fill', { exact: true }).fill(fill)
  await button(page, 'Add rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

export function averageDomainFile() {
  const cells = [
    { addr: 'A1', row: 0, col: 0, kind: 'number', value: 0 },
    { addr: 'A2', row: 1, col: 0, kind: 'number', value: 8 },
    { addr: 'A3', row: 2, col: 0, kind: 'text', value: '999' },
    { addr: 'A4', row: 3, col: 0, kind: 'boolean', value: true },
    { addr: 'A5', row: 4, col: 0, kind: 'formula', value: '=1/0' },
    { addr: 'A6', row: 5, col: 0, kind: 'formula', value: '=\"\"' },
    { addr: 'B1', row: 0, col: 1, kind: 'number', value: -9999 },
    { addr: 'C1', row: 0, col: 2, kind: 'formula', value: '=D1' },
    { addr: 'C900', row: 899, col: 2, kind: 'number', value: 20 },
    { addr: 'D1', row: 0, col: 3, kind: 'number', value: 20 },
  ].map(cell => ({ sheet: 0, ...cell }))
  return Buffer.from(JSON.stringify({ format: 'einfach-workbook', version: 1, title: 'Mean domain',
    canvases: [{ rowCount: 1000, colCount: 8 }], workbook: { version: 1,
      sheets: [{ idx: 0, name: 'Mean' }], cells } }))
}
