import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
const calculate = (page: Page) => page.getByRole('combobox', { name: 'Recalculate', exact: true })
async function go(page: Page, reference: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(reference)
  await name.press('Enter')
  await expect(bar(page)).toBeEnabled()
}
async function write(page: Page, reference: string, value: string) {
  await go(page, reference)
  await bar(page).fill(value)
  await bar(page).press('Enter')
}
async function summary(page: Page) {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('native seed RAND changes on current-sheet calculation, its dependent agrees and history stays empty', async ({ page }) => {
  await summary(page)
  await go(page, 'D62')
  const before = await cell(page, '61:3').textContent()
  await calculate(page).selectOption('sheet')
  await expect(cell(page, '61:3')).not.toHaveText(before!)
  expect(Number(await cell(page, '61:4').textContent())).toBeCloseTo(Number(await cell(page, '61:3').textContent()) * 2, 8)
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Worksheet recalculated' })).toBeVisible()
  await button(page, 'Show formulas').click()
  await expect(cell(page, '61:3')).toHaveText('=RAND()')
  await expect(cell(page, '61:4')).toHaveText('=D62*2')
  await button(page, 'Show formulas').click()
  await expect(cell(page, '61:3')).not.toHaveText('=RAND()')
})

test('worksheet scope leaves unrelated sheet cached; workbook scope refreshes it without adding history', async ({ page }) => {
  await write(page, 'B2', '=RAND()')
  // Enter 只派发提交；等原生结果显示后才记录数值，不能捕获保留帧里的 Acme Co.。
  await expect(cell(page, '1:1')).not.toHaveText('Acme Co.')
  await expect(button(page, 'Undo')).toBeEnabled()
  const orders = await cell(page, '1:1').textContent()
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await go(page, 'D62')
  await calculate(page).selectOption('sheet')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(cell(page, '1:1')).toHaveText(orders!)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await calculate(page).selectOption('workbook')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(cell(page, '1:1')).not.toHaveText(orders!)
  await button(page, 'Undo').click()
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(button(page, 'Undo')).toBeDisabled()
  await calculate(page).selectOption('workbook')
  await expect(button(page, 'Redo')).toBeEnabled()
})

test('formula view covers frozen and merged cells, remembers each sheet and preserves forced text', async ({ page }) => {
  await summary(page)
  await write(page, 'A15', '=2+3')
  await write(page, 'D3', "'=literal")
  await button(page, 'Show formulas').click()
  await expect(page.locator('[data-merged-cell="true"][data-cell="14:0"]')).toHaveText('=2+3')
  await expect(cell(page, '0:1')).toHaveText("='Sales Orders'!G2")
  await expect(cell(page, '2:3')).toHaveText('=literal')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(button(page, 'Show formulas')).toHaveAttribute('aria-pressed', 'false')
  await expect(cell(page, '1:6')).toHaveText('79')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(button(page, 'Show formulas')).toHaveAttribute('aria-pressed', 'true')
  await button(page, 'Show formulas').click()
  await expect(page.locator('[data-merged-cell="true"][data-cell="14:0"]')).toHaveText('5')
})

test('an unfinished formula disables calculation and display toggle without changing the draft', async ({ page }) => {
  await go(page, 'B2')
  await bar(page).fill('=SUM(')
  await expect(calculate(page)).toBeDisabled()
  await expect(button(page, 'Show formulas')).toBeDisabled()
  await expect(bar(page)).toHaveValue('=SUM(')
  await bar(page).press('Escape')
  await expect(calculate(page)).toBeEnabled()
  await expect(button(page, 'Undo')).toBeDisabled()
})

for (const width of [1280, 390]) test(`calculation controls support keyboard and remain visible at ${width}px`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 850 })
  await button(page, 'Show formulas').focus()
  await page.keyboard.press('Space')
  await expect(button(page, 'Show formulas')).toHaveAttribute('aria-pressed', 'true')
  const box = (await button(page, 'Show formulas').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `/tmp/excel-calculation-${width}.png` })
  await page.keyboard.press('Space')
  await expect(button(page, 'Show formulas')).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

const wasmBase = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} artifact truly recalculates native cached RAND and retains history`, async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const wasm = await import(url)
    await wasm.default()
    const book = new wasm.WasmWorkbook()
    try {
      book.set_cell_input(0, 'A1', '=RAND()')
      const before = book.getCellDisplay(0, 'A1')
      const count = book.recalculate(0)
      const after = book.getCellDisplay(0, 'A1')
      return { before, after, count, history: book.history_state() }
    } finally { book.free() }
  }, `${wasmBase}${variant}/einfach_wasm.js`)
  expect(result.count).toBe(1)
  expect(result.after).not.toEqual(result.before)
  expect(result.history.undoCount).toBe(1)
})
