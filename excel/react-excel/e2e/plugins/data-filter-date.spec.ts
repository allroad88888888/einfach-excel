import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { downloadDateFile } from '../support/conditional-dates'
import { launch, go, enable, open, choose, apply, button, cell, menu, dialog } from '../support/date-filter'

for (const width of [1280, 390]) test(`date filter activation keeps today's native time values at ${width}px`, async ({ page }, info) => {
  await launch(page, width)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await enable(page, 'H2:H9'); await open(page, 'H')
  await button(page, 'Date period…').click()
  await expect(page.getByLabel('Date period 1', { exact: true })).toHaveValue('today')
  expect(await dialog(page).evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath(`date-period-${width}.png`) })
  await apply(page); await go(page, 'H4')
  for (const row of [2, 5, 6, 7, 8]) await expect(cell(page, `${row}:7`)).toHaveCount(0)
  await expect(cell(page, '3:7')).toHaveText(/\d{4}-\d{2}-\d{2} 00:00/)
  await expect(cell(page, '4:7')).toHaveText(/\d{4}-\d{2}-\d{2} 18:00/)
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=TODAY()')
  await button(page, 'Undo').click()
  await expect(cell(page, '2:7')).toHaveText(/\d{4}-\d{2}-\d{2}/)
  await expect(cell(page, '6:7')).toHaveText('2024-02-29')
  await button(page, 'Redo').click(); await expect(cell(page, '2:7')).toHaveCount(0)
})

test('date filter is configured through the existing ribbon entry', async ({ page }) => {
  await launch(page); await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await enable(page, 'H2:H9')
  await showRibbonItem(page, 'data.worksheet-filter'); await menu(page).selectOption('open')
  await choose(page); await apply(page)
  await go(page, 'H4'); await expect(cell(page, '4:7')).toBeVisible()
  await expect(cell(page, '5:7')).toHaveCount(0)
  const saved = JSON.parse((await downloadDateFile(page)).toString()).workbook
  expect(saved.filters.find((item: { sheet: number }) => item.sheet === 1).rules)
    .toEqual([{ kind: 'date-period', colIndex: 7, period: 'today' }])
})

test('Chinese date period can be selected and applied with the keyboard at 390px', async ({ page }, info) => {
  await launch(page, 390); await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await enable(page, 'H2:H9')
  await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh')
  const more = page.locator('[data-ribbon-more][aria-expanded="true"]')
  if (await more.count()) await more.click()
  await button(page, 'Filter column H').click()
  await button(page, '日期期间…').focus(); await page.keyboard.press('Enter')
  const period = page.getByLabel('日期期间 1', { exact: true })
  await period.focus()
  // Chromium on macOS needs native typeahead here; Playwright press has no Chinese key mapping.
  const keyboard = await page.context().newCDPSession(page)
  await keyboard.send('Input.dispatchKeyEvent', { type: 'char', text: '昨', key: '昨' })
  await keyboard.detach()
  await expect(period).toHaveValue('yesterday')
  await page.screenshot({ path: info.outputPath('date-period-zh-390.png') })
  await button(page, '应用筛选').focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '2:7')).toBeVisible()
  for (const row of [3, 4, 5, 6, 7, 8]) await expect(cell(page, `${row}:7`)).toHaveCount(0)
  await button(page, '撤销').click(); await expect(cell(page, '3:7')).toBeVisible()
})

test('Canvas painted header opens the date plugin and applies its native snapshot', async ({ page }) => {
  await launch(page, 1400, '&renderer=canvas')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await enable(page, 'H2:H9')
  const col = await page.getByRole('columnheader', { name: 'Select column H', exact: true }).boundingBox()
  const row = await button(page, 'Select row 2').boundingBox()
  expect(col).not.toBeNull(); expect(row).not.toBeNull()
  const point = { x: col!.x + col!.width - 11, y: row!.y + row!.height / 2 }
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point)).toBe('CANVAS')
  await page.mouse.click(point.x, point.y); await choose(page); await apply(page)
  for (const row of [4, 5]) await expect(button(page, `Select row ${row}`)).toBeVisible()
  for (const row of [3, 6, 7, 8, 9]) await expect(button(page, `Select row ${row}`)).toHaveCount(0)
  const saved = JSON.parse((await downloadDateFile(page)).toString()).workbook
  expect(saved.filters.find((item: { sheet: number }) => item.sheet === 1))
    .toMatchObject({ rules: [{ kind: 'date-period', colIndex: 7, period: 'today' }], hiddenRows: [2, 5, 6, 7, 8] })
  await button(page, 'Undo').click(); await expect(button(page, 'Select row 3')).toBeVisible()
  await button(page, 'Redo').click(); await expect(button(page, 'Select row 3')).toHaveCount(0)
})
