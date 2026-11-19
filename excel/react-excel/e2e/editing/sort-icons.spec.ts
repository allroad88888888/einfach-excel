import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { downloadDateFile, openDateFile } from '../support/conditional-dates'
import { showRibbonItem } from '../support/ribbon'
import { button, cell, icon, open, save, threshold } from '../advanced-conditional-format/support'

const original = ['down', 'missing', 'middle', 'up', 'flag']
const fixture = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Icon order', canvases: [{ rowCount: 40, colCount: 8 }],
  workbook: {
    version: 1, sheets: [{ idx: 0, name: 'Icons' }],
    cells: [
      { sheet: 0, addr: 'A1', row: 0, col: 0, kind: 'text', value: 'Score' },
      { sheet: 0, addr: 'B1', row: 0, col: 1, kind: 'text', value: 'Record' },
      { sheet: 0, addr: 'C2', row: 1, col: 2, kind: 'text', value: 'Outside' },
      ...original.flatMap((value, i) => [
        { sheet: 0, addr: `A${i + 2}`, row: i + 1, col: 0, kind: i === 1 ? 'text' : 'number',
          value: [100, 'text', 10, 0, 0][i] },
        { sheet: 0, addr: `B${i + 2}`, row: i + 1, col: 1, kind: 'text', value },
      ]),
    ],
    formats: [{ sheet: 0, startRow: 3, endRow: 5, startCol: 0, endCol: 0, cellStyles: [
      { addr: 'A4', format: { bgColor: '#ffd966' } },
      { addr: 'A6', format: { bgColor: '#ffd966' } },
    ] }],
  },
}))

const panel = (page: Page) => page.getByRole('dialog', { name: 'Icon sort', exact: true })
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?plugins=data-sort&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, fixture)
  await select(page, 'A2:A5', '1:0')
  await open(page, 'icon-set')
  await threshold(page, 'Lower icon', 'number', '10')
  await threshold(page, 'Upper icon', 'number', '50')
  await page.getByLabel('Reverse icon order', { exact: true }).check()
  await page.getByLabel('Show icon only', { exact: true }).check()
  await save(page)
  await select(page, 'A6', '5:0')
  await open(page, 'icon-set')
  await page.getByLabel('Icon style', { exact: true }).selectOption('three-flags')
  await threshold(page, 'Lower icon', 'number', '10')
  await threshold(page, 'Upper icon', 'number', '50')
  await page.getByLabel('Reverse icon order', { exact: true }).check()
  await save(page)
  await expect(icon(page, '4:0')).toHaveAttribute('data-icon-index', '2')
  await expect(icon(page, '4:0')).toHaveAttribute('data-icon-set', 'three-arrows')
  await expect(icon(page, '5:0')).toHaveAttribute('data-icon-index', '2')
  await expect(icon(page, '5:0')).toHaveAttribute('data-icon-set', 'three-flags')
  await expect(icon(page, '2:0')).toHaveCount(0)
  await select(page, 'A1:B6', '0:0')
  await showRibbonItem(page, 'data.icon-sort')
  await button(page, 'Icon sort').click()
  await panel(page).getByLabel('First row is a header', { exact: true }).check()
})

async function records(page: Page, values: readonly string[]) {
  for (const [i, value] of values.entries()) await expect(cell(page, `${i + 1}:1`)).toHaveText(value)
  await expect(cell(page, '0:0')).toHaveText('Score')
  await expect(cell(page, '1:2')).toHaveText('Outside')
}
async function apply(page: Page, sorted: readonly string[]) {
  await panel(page).getByRole('button', { name: 'Apply sort', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
  await records(page, sorted)
  await button(page, 'Undo').click()
  await records(page, original)
  await button(page, 'Redo').click()
  await records(page, sorted)
}

test('Displayed reversed icons sort before equal indices from a different set', async ({ page }) => {
  await panel(page).getByLabel('Target icon', { exact: true }).selectOption('three-arrows:2')
  await apply(page, ['up', 'down', 'missing', 'middle', 'flag'])
})

test('No icon moves only iconless records and keeps icon groups stable', async ({ page }) => {
  await panel(page).getByLabel('Target icon', { exact: true }).selectOption('none')
  await apply(page, ['missing', 'down', 'middle', 'up', 'flag'])
})

test('On bottom keeps other icon identities stable', async ({ page }) => {
  await panel(page).getByLabel('Target icon', { exact: true }).selectOption('three-arrows:0')
  await panel(page).getByLabel('Sort order 1', { exact: true }).selectOption('bottom')
  await apply(page, ['missing', 'middle', 'up', 'flag', 'down'])
})

test('Icon and color criteria can sort the same column at different levels', async ({ page }) => {
  await panel(page).getByLabel('Target icon', { exact: true }).selectOption('three-arrows:2')
  await panel(page).getByRole('button', { name: 'Add level', exact: true }).click()
  const second = panel(page).getByRole('group', { name: 'Sort level 2', exact: true })
  await second.getByLabel('Sort on', { exact: true }).selectOption('cell-color')
  await second.getByLabel('Target color', { exact: true }).fill('#ffd966')
  await apply(page, ['up', 'middle', 'flag', 'down', 'missing'])
})

test('Icon-sorted records reopen in native and XLSX files without the editor', async ({ page }) => {
  await panel(page).getByLabel('Target icon', { exact: true }).selectOption('three-arrows:2')
  const expected = ['up', 'down', 'missing', 'middle', 'flag']
  await apply(page, expected)
  const native = await downloadDateFile(page)
  const xlsx = await downloadDateFile(page, true)
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  for (const [bytes, extension] of [[native, 'einfach.json'], [xlsx, 'xlsx']] as const) {
    await openDateFile(page, bytes, extension)
    await records(page, expected)
    if (extension === 'einfach.json') {
      await expect(icon(page, '1:0')).toHaveAttribute('data-icon-index', '2')
      await expect(cell(page, '1:0').locator('[data-conditional-icon-value="hidden"]'))
        .toHaveCSS('opacity', '0')
    }
    await expect(button(page, 'Undo')).toBeDisabled()
  }
})
