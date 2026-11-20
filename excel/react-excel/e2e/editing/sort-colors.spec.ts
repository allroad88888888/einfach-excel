import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { downloadDateFile, openDateFile } from '../support/conditional-dates'
import { showRibbonItem } from '../support/ribbon'

const original = ['none', 'red-1', 'pattern', 'white', 'red-2', 'base-font']
const workbook = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Visual sort', canvases: [{ rowCount: 32, colCount: 8 }],
  workbook: {
    version: 1, sheets: [{ idx: 0, name: 'Colors' }],
    cells: [
      { sheet: 0, addr: 'A1', row: 0, col: 0, kind: 'text', value: 'Marker' },
      { sheet: 0, addr: 'B1', row: 0, col: 1, kind: 'text', value: 'Record' },
      { sheet: 0, addr: 'C2', row: 1, col: 2, kind: 'text', value: 'Outside' },
      ...original.flatMap((value, i) => [
        { sheet: 0, addr: `A${i + 2}`, row: i + 1, col: 0, kind: 'number',
          value: [5, 20, 2, 4, -12, 9][i] },
        { sheet: 0, addr: `B${i + 2}`, row: i + 1, col: 1, kind: 'text', value },
      ]),
    ],
    formats: [{ sheet: 0, startRow: 1, endRow: 6, startCol: 0, endCol: 0, cellStyles: [
      { addr: 'A3', format: { bgColor: '#c00000', fgColor: '#0000ff',
        numberFormat: { kind: 'custom', pattern: '[Red]0;[Blue]0' } } },
      { addr: 'A4', format: { bgColor: '#c00000', fgColor: '#000000',
        fill: { kind: 'pattern', pattern: 'darkGrid', foreground: '#c00000' } } },
      { addr: 'A5', format: { bgColor: '#ffffff', fgColor: '#008000' } },
      { addr: 'A6', format: { bgColor: '#c00000', fgColor: '#0000ff',
        numberFormat: { kind: 'custom', pattern: '[Red]0;[Blue]0' } } },
      { addr: 'A7', format: { fgColor: '#ff0000' } },
    ] }],
  },
}))

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Color sort', exact: true })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?plugins=data-sort&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, workbook)
  await expect(cell(page, '0:0')).toHaveText('Marker')
  await select(page, 'A1:B7', '0:0')
  await showRibbonItem(page, 'data.color-sort')
  await button(page, 'Color sort').click()
  await panel(page).getByLabel('First row is a header', { exact: true }).check()
})

async function records(page: Page, expected: readonly string[]) {
  for (const [i, record] of expected.entries()) await expect(cell(page, `${i + 1}:1`)).toHaveText(record)
  await expect(cell(page, '0:0')).toHaveText('Marker')
  await expect(cell(page, '1:2')).toHaveText('Outside')
}
async function applyAndCheckHistory(page: Page, expected: readonly string[]) {
  await panel(page).getByRole('button', { name: 'Apply sort', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
  await records(page, expected)
  await button(page, 'Undo').click()
  await records(page, original)
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await records(page, expected)
}

test('Cell fill color moves complete solid-color records in one undo step', async ({ page }) => {
  await panel(page).getByLabel('Sort on', { exact: true }).selectOption('cell-color')
  await panel(page).getByLabel('Target color', { exact: true }).fill('#c00000')
  await applyAndCheckHistory(page, ['red-1', 'red-2', 'none', 'pattern', 'white', 'base-font'])
  await expect(cell(page, '1:0')).toHaveCSS('background-color', 'rgb(192, 0, 0)')
  await expect(cell(page, '4:0')).toHaveCSS('background-image', /data:image\/svg\+xml/)
})

test('Font color uses rendered number-section colors when moving records', async ({ page }) => {
  await panel(page).getByLabel('Sort on', { exact: true }).selectOption('font-color')
  await panel(page).getByLabel('Target color', { exact: true }).fill('#ff0000')
  await applyAndCheckHistory(page, ['red-1', 'base-font', 'none', 'pattern', 'white', 'red-2'])
})

test('No fill is distinct from explicit white and patterned cells', async ({ page }) => {
  await panel(page).getByLabel('No fill', { exact: true }).check()
  await applyAndCheckHistory(page, ['none', 'base-font', 'red-1', 'pattern', 'white', 'red-2'])
})

test('On bottom moves automatic font-color records after explicit black', async ({ page }) => {
  await panel(page).getByLabel('Sort on', { exact: true }).selectOption('font-color')
  await panel(page).getByLabel('Automatic font color', { exact: true }).check()
  await panel(page).getByLabel('Sort order 1', { exact: true }).selectOption('bottom')
  await applyAndCheckHistory(page, ['red-1', 'pattern', 'white', 'red-2', 'base-font', 'none'])
})

test('Same-column color levels apply their configured priority stably', async ({ page }) => {
  await panel(page).getByLabel('Target color', { exact: true }).fill('#c00000')
  await panel(page).getByRole('button', { name: 'Add level', exact: true }).click()
  await panel(page).getByRole('group', { name: 'Sort level 2', exact: true })
    .getByLabel('Target color', { exact: true }).fill('#ffffff')
  await panel(page).getByRole('button', { name: 'Move sort level 2 up', exact: true }).click()
  await applyAndCheckHistory(page, ['white', 'red-1', 'red-2', 'none', 'pattern', 'base-font'])
})

test('Conditional solid fill sorts by pre-move appearance over a pattern', async ({ page }) => {
  await panel(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await select(page, 'A4', '3:0')
  await showRibbonItem(page, 'format.conditional-formatting')
  await button(page, 'Conditional formatting').click()
  await page.getByLabel('Value', { exact: true }).fill('1')
  await page.getByLabel('Highlight fill', { exact: true }).fill('#00ff00')
  await button(page, 'Add rule').click()
  await expect(cell(page, '3:0')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await expect(cell(page, '3:0')).toHaveCSS('background-image', 'none')
  await select(page, 'A1:B7', '0:0')
  await showRibbonItem(page, 'data.color-sort')
  await button(page, 'Color sort').click()
  await panel(page).getByLabel('First row is a header').check()
  await panel(page).getByLabel('Target color', { exact: true }).fill('#00ff00')
  await panel(page).getByRole('button', { name: 'Apply sort', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
  await records(page, ['pattern', 'none', 'red-1', 'white', 'red-2', 'base-font'])
  await button(page, 'Undo').click()
  await records(page, original)
  await expect(cell(page, '3:0')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
})

test('Sorted color records reopen in native and XLSX files', async ({ page }) => {
  const ordered = ['none', 'pattern', 'white', 'base-font', 'red-1', 'red-2']
  await panel(page).getByLabel('Target color', { exact: true }).fill('#c00000')
  await panel(page).getByLabel('Sort order 1', { exact: true }).selectOption('bottom')
  await applyAndCheckHistory(page, ordered)
  const native = await downloadDateFile(page)
  const excel = await downloadDateFile(page, true)
  for (const [bytes, extension] of [[native, 'einfach.json'], [excel, 'xlsx']] as const) {
    await openDateFile(page, bytes, extension)
    await records(page, ordered)
    await expect(cell(page, '5:0')).toHaveCSS('background-color', 'rgb(192, 0, 0)')
    await expect(button(page, 'Undo')).toBeDisabled()
  }
})
