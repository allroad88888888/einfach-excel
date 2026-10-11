import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const panel = (page: Page) => page.getByRole('dialog', { name: 'Workbook files' })
async function download(page: Page) {
  await button(page, 'File').click()
  const downloading = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const file = await downloading
  const path = await file.path()
  expect(file.suggestedFilename()).toMatch(/\.einfach\.json$/)
  const data = await readFile(path!, 'utf8')
  await expect(panel(page)).toContainText('Download requested')
  await button(page, 'Close').click()
  return data
}
async function open(page: Page, text: string, accept = true) {
  await button(page, 'File').click()
  page.once('dialog', (dialog) => accept ? dialog.accept() : dialog.dismiss())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Book.einfach.json', mimeType: 'application/json', buffer: Buffer.from(text),
  })
}
async function blank(page: Page, accept = true) {
  await button(page, 'File').click()
  page.once('dialog', (dialog) => accept ? dialog.accept() : dialog.dismiss())
  await button(page, 'New blank workbook').click()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('download edited workbook, create blank, open file and continue native editing/history', async ({ page }) => {
  await select(page, 'A2', '1:0')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('Saved order'); await input.press('Enter')
  await expect(cell(page, '1:0')).toHaveText('Saved order')
  const text = await download(page)
  const file = JSON.parse(text)
  expect(file.format).toBe('einfach-workbook')
  expect(file.workbook.version).toBe(1)
  expect(file.canvases).toHaveLength(2)
  await blank(page)
  await expect(panel(page)).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Sheet1', exact: true })).toBeVisible()
  await expect(cell(page, '0:0')).toBeEmpty()
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(page.locator('.workbook-name')).toHaveText('Untitled workbook')
  await open(page, text)
  await expect(panel(page)).toHaveCount(0)
  await expect(cell(page, '1:0')).toHaveText('Saved order')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await expect(button(page, 'Undo')).toBeDisabled()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText('79')
  await expect(page.locator('.sheet-grid-frame')).toHaveAttribute('data-frozen-rows', '1')
  await expect(cell(page, '9:0')).toHaveCount(0)
  const first = await cell(page, '0:0').boundingBox()
  expect(first!.width).toBeCloseTo(200, 0)
  expect(first!.height).toBeCloseTo(40, 0)
  await select(page, 'E85', '84:4')
  await expect(cell(page, '84:4')).toHaveCSS('background-color', 'rgb(226, 240, 217)')
  await expect(cell(page, '84:4')).not.toHaveCSS('font-style', 'italic')
  await select(page, 'F85', '84:5')
  await expect(cell(page, '84:5')).toHaveCSS('background-color', 'rgb(255, 199, 206)')
  await select(page, 'E85', '84:4')
  await input.fill('Changed'); await input.press('Enter')
  await expect(cell(page, '84:4')).toHaveText('Changed')
  await button(page, 'Undo').click()
  await expect(cell(page, '84:4')).toHaveText('Ready')
})

test('invalid native content leaves values, selection, history and current file usable', async ({ page }) => {
  const file = JSON.parse(await download(page))
  await select(page, 'A2', '1:0')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('Keep me'); await input.press('Enter')
  file.workbook.version = 999
  await open(page, JSON.stringify(file))
  await expect(panel(page).getByRole('alert')).toContainText('Current workbook kept')
  await button(page, 'Close').click()
  await expect(cell(page, '1:0')).toHaveText('Keep me')
  await button(page, 'Undo').click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await open(page, '{not json')
  await expect(panel(page).getByRole('alert')).toContainText('not a valid')
})

test('cancel replacement preserves the workbook, and a blank workbook persists its own edits', async ({ page }) => {
  await blank(page, false)
  await expect(panel(page)).toBeVisible()
  await button(page, 'Close').click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await open(page, '{}', false)
  await expect(panel(page).getByRole('alert')).toHaveCount(0)
  await button(page, 'Close').click()
  await blank(page)
  await expect(panel(page)).toHaveCount(0)
  await select(page, 'A1', '0:0')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('=SUM(2,3)'); await input.press('Enter')
  await expect(cell(page, '0:0')).toHaveText('5')
  const text = await download(page)
  await open(page, text)
  await expect(panel(page)).toHaveCount(0)
  await expect(cell(page, '0:0')).toHaveText('5')
  await expect(input).toHaveValue('=SUM(2,3)')
  await expect(button(page, 'Undo')).toBeDisabled()
  await select(page, 'XFD1048576', '1048575:16383')
  await input.fill('Last cell'); await input.press('Enter')
  await expect(cell(page, '1048575:16383')).toHaveText('Last cell')
})

for (const width of [1280, 390]) test(`file panel fits and restores focus at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await button(page, 'File').click()
  await expect(button(page, 'Download workbook')).toBeFocused()
  const bounds = await panel(page).boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
  expect(await panel(page).evaluate((element) =>
    element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: `/tmp/excel-workbook-files-${width}.png` })
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(button(page, 'File')).toBeFocused()
  expect(errors).toEqual([])
})
