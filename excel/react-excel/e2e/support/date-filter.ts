import { expect, type Page } from '@playwright/test'
import { showRibbonItem } from './ribbon'
import { openDateFile } from './conditional-dates'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const dialog = (page: Page) => page.getByRole('dialog', { name: /filter conditions$/i })
export const menu = (page: Page) => page.getByRole('combobox', { name: 'Worksheet filter' })

export async function launch(page: Page, width = 1280, extra = '') {
  await page.setViewportSize({ width, height: 850 })
  await page.goto(`/?plugins=data-filter&locale=en${extra}`)
  if (extra.includes('renderer=canvas')) await expect(page.locator('[data-workbook-grid] canvas')).toBeVisible()
  else await expect(cell(page, '1:0')).toHaveText('SO-10001')
}
export async function go(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address); await name.press('Enter')
  await expect(name).toHaveValue(address)
}
export async function enable(page: Page, range: string) {
  await go(page, range); await showRibbonItem(page, 'data.worksheet-filter')
  await menu(page).selectOption('selection')
}
export async function open(page: Page, column = 'B', table = '') {
  const more = page.locator('[data-ribbon-more][aria-expanded="true"]')
  if (await more.count()) await more.click()
  await button(page, `Filter ${table ? `${table} ` : ''}column ${column}`).click()
  await expect(dialog(page)).toBeVisible()
}
export async function choose(page: Page, period = 'today', index = 1) {
  const condition = dialog(page).getByLabel(`Filter condition ${index}`, { exact: true }).locator('..')
  const activate = condition.getByRole('button', { name: 'Date period…', exact: true })
  if (await activate.count()) await activate.click()
  await dialog(page).getByLabel(`Date period ${index}`, { exact: true }).selectOption(period)
}
export async function apply(page: Page) {
  await button(page, 'Apply filter').click(); await expect(dialog(page)).toHaveCount(0)
}
export async function boundaries(page: Page, start = 'TODAY()', end = 'TODAY()+1') {
  const values = [
    ['formula', `=(${start})-0.01`], ['formula', `=${start}`],
    ['formula', `=(${start})+0.75`], ['formula', `=(${end})-0.01`],
    ['formula', `=${end}`], ['formula', `=TEXT(${start},"0")`],
    ['text', '2024-02-29'], ['boolean', true], ['formula', '=1/0'], ['null', undefined], ['number', 0],
  ]
  const file = { format: 'einfach-workbook', version: 1, title: 'Date boundaries',
    canvases: [{ rowCount: 35, colCount: 5 }], workbook: { version: 1,
      sheets: [{ idx: 0, name: 'Dates' }], cells: [
        ...['Record', 'Date', 'Score', 'Neighbor'].map((value, col) =>
          ({ sheet: 0, row: 0, col, kind: 'text', value })),
        ...values.flatMap(([kind, value], index) => [
          { sheet: 0, row: index + 1, col: 0, kind: 'text', value: `R${index + 1}` },
          { sheet: 0, row: index + 1, col: 1, kind, ...(value === undefined ? {} : { value }) },
          { sheet: 0, row: index + 1, col: 2, kind: 'number', value: 100 - index * 10 },
        ]),
        { sheet: 0, row: 13, col: 3, kind: 'text', value: 'Outside filter' },
      ].map(cell => ({ ...cell, addr: `${String.fromCharCode(65 + cell.col)}${cell.row + 1}` })) } }
  await openDateFile(page, Buffer.from(JSON.stringify(file)))
  await expect(cell(page, '1:0')).toHaveText('R1')
  await enable(page, 'A1:C12')
}
export async function rows(page: Page, visible: readonly number[]) {
  await go(page, 'A1')
  for (let row = 1; row <= 11; row++) {
    if (visible.includes(row)) await expect(cell(page, `${row}:0`)).toHaveText(`R${row}`)
    else await expect(cell(page, `${row}:0`)).toHaveCount(0)
  }
  await expect(cell(page, '0:0')).toHaveText('Record')
  await expect(cell(page, '13:3')).toHaveText('Outside filter')
}
