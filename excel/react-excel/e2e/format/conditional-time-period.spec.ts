import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { addDateRule, dateButton as button, dateCell as cell, openDateRules,
  openDateFile } from '../support/conditional-dates'

test('date occurring today highlights native dates with times and undoes once at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A13:F13', '12:0')
  const before = await Promise.all([0, 1, 2, 3, 4, 5].map(col => cell(page, `12:${col}`)
    .evaluate(node => ({ color: getComputedStyle(node).backgroundColor, text: node.textContent }))))
  expect(before[1].color).toBe('rgb(226, 240, 217)')
  expect(before[2].color).toBe('rgb(226, 240, 217)')
  await addDateRule(page, 'A13:F13')
  for (const col of [0, 1, 2, 3, 4, 5]) {
    await expect(cell(page, `12:${col}`)).toHaveCSS('background-color',
      [1, 2].includes(col) ? 'rgb(0, 255, 0)' : before[col].color)
    await expect(cell(page, `12:${col}`)).toHaveText(before[col].text ?? '')
  }
  await expect(cell(page, '13:1')).toBeEmpty()
  await button(page, 'Undo').click()
  for (const col of [0, 1, 2, 3, 4, 5])
    await expect(cell(page, `12:${col}`)).toHaveCSS('background-color', before[col].color)
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '12:2')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await select(page, 'C13', '12:2')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=TODAY()+0.75')
  await openDateRules(page)
  await button(page, 'Edit rule 1').click()
  await expect(page.getByLabel('Date period')).toHaveValue('today')
  await expect(page.getByLabel('Applies to')).toHaveValue('A13:F13')
  await page.screenshot({ path: test.info().outputPath('date-desktop.png') })
})

const periods = [
  ['yesterday', 'TODAY()-1', 'TODAY()'],
  ['tomorrow', 'TODAY()+1', 'TODAY()+2'],
  ['last7Days', 'TODAY()-6', 'TODAY()+1'],
  ['thisWeek', 'TODAY()-WEEKDAY(TODAY(),1)+1', 'TODAY()-WEEKDAY(TODAY(),1)+8'],
  ['lastWeek', 'TODAY()-WEEKDAY(TODAY(),1)-6', 'TODAY()-WEEKDAY(TODAY(),1)+1'],
  ['nextWeek', 'TODAY()-WEEKDAY(TODAY(),1)+8', 'TODAY()-WEEKDAY(TODAY(),1)+15'],
  ['thisMonth', 'DATE(YEAR(TODAY()),MONTH(TODAY()),1)', 'DATE(YEAR(TODAY()),MONTH(TODAY())+1,1)'],
  ['lastMonth', 'DATE(YEAR(TODAY()),MONTH(TODAY())-1,1)', 'DATE(YEAR(TODAY()),MONTH(TODAY()),1)'],
  ['nextMonth', 'DATE(YEAR(TODAY()),MONTH(TODAY())+1,1)', 'DATE(YEAR(TODAY()),MONTH(TODAY())+2,1)'],
] as const

for (const [period, start, end] of periods) test(`date ${period} saves through DOM and honors both calendar boundaries`, async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  const formulas = [`=(${start})-0.01`, `=${start}`, `=(${start})+0.75`, `=(${end})-0.01`, `=${end}`, '=1/0']
  const file = { format: 'einfach-workbook', version: 1, title: 'Date boundaries',
    canvases: [{ rowCount: 30, colCount: 8 }], workbook: { version: 1, sheets: [{ idx: 0, name: 'Dates' }],
      cells: [...formulas.map((value, row) => ({ sheet: 0, addr: `A${row + 1}`,
        row, col: 0, kind: 'formula', value })),
        { sheet: 0, addr: 'B1', row: 0, col: 1, kind: 'text', value: 'Neighbor' },
        { sheet: 0, addr: 'A7', row: 6, col: 0, kind: 'text', value: '2026-11-12' }] } }
  await openDateFile(page, Buffer.from(JSON.stringify(file)))
  await select(page, 'A1:A8', '0:0')
  await addDateRule(page, 'A1:A8', period)
  for (let row = 0; row < 8; row++) {
    if ([1, 2, 3].includes(row)) await expect(cell(page, `${row}:0`)).toHaveCSS('background-color', 'rgb(0, 255, 0)')
    else await expect(cell(page, `${row}:0`)).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  }
  await expect(cell(page, '0:1')).toHaveText('Neighbor')
  await expect(cell(page, '0:1')).not.toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await select(page, 'A3', '2:0')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(formulas[2])
})

test('date period fields save on a 390px screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'B13', '12:1')
  await openDateRules(page)
  await page.getByLabel('Rule type').selectOption('time-period')
  await page.getByLabel('Date period').selectOption('last7Days')
  await page.getByLabel('Highlight fill', { exact: true }).fill('#00ff00')
  const dialog = page.getByRole('dialog', { name: 'Conditional formatting', exact: true })
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('date-mobile.png') })
  await button(page, 'Add rule').click()
  await expect(dialog).toHaveCount(0)
  await expect(cell(page, '12:1')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
})
