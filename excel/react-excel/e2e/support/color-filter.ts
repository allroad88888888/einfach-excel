import { expect, type Page } from '@playwright/test'
import { select } from './clipboard'
import { openDateFile } from './conditional-dates'
import { launch, enable, button, cell, open, go, dialog } from './date-filter'

const records = ['Red solid', 'Pattern', 'Explicit white', 'Red blank', 'Rich text', 'Automatic', 'Threshold']
const first = ['same', 7, 'same', null, 'Red dark red', 'same', 20]

export function colorFilterFile(palette = false) {
  const extra = palette ? 26 : 0
  const outside = palette ? 35 : 9
  const bases = first.flatMap((value, i) => [
    ...(value === null ? [] : [{ sheet: 0, addr: `A${i + 2}`, row: i + 1, col: 0,
      kind: typeof value === 'number' ? 'number' : 'text', value }]),
    { sheet: 0, addr: `B${i + 2}`, row: i + 1, col: 1, kind: 'text', value: records[i] },
  ])
  const workbook = {
    version: 1, sheets: [{ idx: 0, name: 'Colors' }],
    cells: [
      { sheet: 0, addr: 'A1', row: 0, col: 0, kind: 'text', value: 'Sample' },
      { sheet: 0, addr: 'B1', row: 0, col: 1, kind: 'text', value: 'Record' },
      { sheet: 0, addr: `C${outside + 1}`, row: outside, col: 2, kind: 'text', value: 'Outside' },
      ...bases,
      ...Array.from({ length: extra }, (_, i) => ({
        sheet: 0, addr: `B${i + 9}`, row: i + 8, col: 1, kind: 'text', value: `Palette ${i + 1}`,
      })),
    ],
    formats: [{ sheet: 0, startRow: 1, endRow: 7 + extra, startCol: 0, endCol: 0, cellStyles: [
      { addr: 'A2', format: { bgColor: '#c00000', fgColor: '#0000ff' } },
      { addr: 'A3', format: { bgColor: '#c00000', fgColor: '#0000ff',
        fill: { kind: 'pattern', pattern: 'darkGrid', foreground: '#c00000' },
        numberFormat: { kind: 'custom', pattern: '[Red]0;[Blue]0' } } },
      { addr: 'A4', format: { bgColor: '#ffffff', fgColor: '#000000' } },
      { addr: 'A5', format: { bgColor: '#c00000' } },
      { addr: 'A6', format: { fgColor: '#000000' } },
      { addr: 'A8', format: { fgColor: '#0000ff' } },
      ...Array.from({ length: extra }, (_, i) => ({
        addr: `A${i + 9}`, format: { bgColor: `#2277${i.toString(16).padStart(2, '0')}` },
      })),
    ] }],
    richText: [{ sheet: 0, row: 5, col: 0, runs: [
      { text: 'Red', format: { color: '#FF0000' } },
      { text: ' dark ', format: {} },
      { text: 'red', format: { color: '#FF0000' } },
    ] }],
  }
  return Buffer.from(JSON.stringify({ format: 'einfach-workbook', version: 1, title: 'Color filters',
    canvases: [{ rowCount: 70, colCount: 8 }], workbook }))
}

export async function launchColors(page: Page, options: { width?: number; palette?: boolean } = {}) {
  await launch(page, options.width)
  await openDateFile(page, colorFilterFile(options.palette))
  await expect(cell(page, '1:1')).toHaveText(records[0])
  const target = options.palette ? 'A1:B34' : 'A1:B8'
  await select(page, target, '0:0')
  await enable(page, target)
}

export async function chooseColor(page: Page, source: 'fill' | 'font', value?: string) {
  await open(page, 'A')
  const activation = button(page, 'Filter by color…')
  if (await activation.count()) await activation.click()
  await dialog(page).getByRole('combobox', { name: 'Color source 1', exact: true }).selectOption(source)
  if (value !== undefined) await dialog(page).getByLabel('RGB color 1', { exact: true }).fill(value)
}

export async function visibleColorRecords(page: Page, rows: readonly number[], outside = 9) {
  await go(page, 'A1')
  for (let i = 0; i < records.length; i++) {
    const item = cell(page, `${i + 1}:1`)
    if (rows.includes(i + 1)) await expect(item).toHaveText(records[i])
    else await expect(item).toHaveCount(0)
  }
  await expect(cell(page, '0:0')).toHaveText('Sample')
  await expect(cell(page, `${outside}:2`)).toHaveText('Outside')
}
