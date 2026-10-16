import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Go to special' })
async function go(page: Page, range: string) {
  await nameBox(page).fill(range)
  await nameBox(page).press('Enter')
  await expect(nameBox(page)).toHaveValue(range)
  await expect(button(page, 'Go to special')).toBeEnabled()
}
async function locate(page: Page, kind: string) {
  await button(page, 'Go to special').click()
  await button(page, kind).click()
  await expect(dialog(page)).toBeHidden()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
})

for (const [kind, coordinates] of [
  ['Constants', ['92:0', '92:1', '92:2', '92:4', '92:5', '93:0']],
  ['Formulas', ['92:3', '93:1', '93:2']],
  ['Blanks', ['93:3', '93:4', '93:5']],
] as const) test(`${kind} selects only the native seed identities, including visually empty cells`, async ({ page }) => {
  await go(page, 'A93:F94')
  await locate(page, kind)
  await expect.poll(() => page.locator('td[data-selected="true"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-cell')))).toEqual(coordinates)
  await expect(page.getByText(`Selected: ${coordinates.length}`, { exact: true })).toBeVisible()
  await expect(page.locator('.selection-outline').first()).toBeVisible()
  await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
  await expect(button(page, 'Undo')).toBeDisabled()
})

for (const action of ['Borders']) test(`${action} cannot silently mutate only the primary area`, async ({ page }) => {
  await go(page, 'A93:F94')
  await locate(page, 'Constants')
  await button(page, action).click()
  await expect(cell(page, '92:0')).toHaveText('10')
  await expect(cell(page, '92:4')).toHaveText('30')
  await expect(cell(page, '92:0')).not.toHaveCSS('font-weight', '700')
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(page.getByRole('status', { name: 'Multi-area selection' })).toContainText('one continuous range')
  await go(page, 'A93:C93')
  await expect(page.getByRole('status', { name: 'Multi-area selection' })).toBeHidden()
  await button(page, 'Bold').click()
  await expect(button(page, 'Undo')).toBeEnabled()
  await button(page, 'Undo').click()
})

test('no matches preserves selection and dialog; changing condition retries without history', async ({ page }) => {
  await go(page, 'A93:C93')
  await button(page, 'Go to special').click()
  await expect(dialog(page)).toContainText('Selected range: A93:C93')
  await button(page, 'Blanks').click()
  await expect(dialog(page).getByRole('alert')).toContainText('No matching cells')
  await expect(nameBox(page)).toHaveValue('A93:C93')
  await button(page, 'Constants').click()
  await expect(dialog(page)).toBeHidden()
  await expect(cell(page, '92:0')).toHaveAttribute('data-selected', 'true')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('single-cell scope finds offscreen formulas and keeps frozen and hidden geometry intact', async ({ page }) => {
  await go(page, 'H100')
  await button(page, 'Go to special').click()
  await expect(dialog(page)).toContainText('Entire worksheet canvas: A1:H100')
  await button(page, 'Formulas').click()
  await expect(dialog(page)).toBeHidden()
  await expect(cell(page, '0:1')).toHaveAttribute('data-selected', 'true')
  // 定位冻结首行不会擅自重置正文滚动；显式滚动后检查正文区域。
  await page.locator('.sheet-scroll').evaluate((node) => { node.scrollTop = 0 })
  await expect(cell(page, '1:1')).toHaveAttribute('data-selected', 'true')
  // 用滚动验证原查询含离屏结果，不重新点名称框替换选区。
  await page.locator('.sheet-scroll').evaluate((node) => { node.scrollTop = node.scrollHeight })
  await expect(cell(page, '93:1')).toHaveAttribute('data-selected', 'true')
  await expect(cell(page, '93:2')).toHaveAttribute('data-selected', 'true')
  await expect(cell(page, '92:0')).not.toHaveAttribute('data-selected')
  await expect(cell(page, '93:6')).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})

for (const width of [1280, 390]) test(`long located range keeps its first cell editable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await go(page, 'G1001')
  await expect(cell(page, '1000:6')).toBeVisible()
  await locate(page, 'Formulas')
  await expect(nameBox(page)).toHaveValue('G2:G1001')
  await expect(cell(page, '1:6')).toBeVisible()
  await expect(cell(page, '1000:6')).toHaveCount(0)
  await expect(page.getByText('Selected: 1000', { exact: true })).toHaveCount(1)
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await expect(formula).toBeEnabled()
  await expect(formula).toHaveValue('=E2*F2')
  await expect(button(page, 'Undo')).toBeDisabled()
  await formula.fill('12345')
  await formula.press('Enter')
  await expect(cell(page, '1:6')).toHaveText('12345')
  await button(page, 'Undo').click()
  await go(page, 'G2')
  await expect(formula).toHaveValue('=E2*F2')
  await go(page, 'G1001')
  await expect(formula).toHaveValue('=E1001*F1001')
})

test('merged constants never select neighboring blanks through bounding-box expansion', async ({ page }) => {
  await go(page, 'A17:C18')
  await locate(page, 'Constants')
  await expect(page.locator('[data-merged-cell="true"][data-cell="16:0"]')).toHaveAttribute('aria-selected', 'true')
  await expect(cell(page, '16:2')).not.toHaveAttribute('data-selected')
  await expect(cell(page, '17:2')).not.toHaveAttribute('data-selected')
  await go(page, 'A17:C18')
  await locate(page, 'Blanks')
  await expect(cell(page, '16:2')).toHaveAttribute('data-selected', 'true')
  await expect(cell(page, '17:2')).toHaveAttribute('data-selected', 'true')
  await expect(page.locator('[data-merged-cell="true"][data-cell="16:0"]')).toHaveAttribute('aria-selected', 'false')
})

test('active spill children are formulas, not blank cells, even when the anchor is outside the query', async ({ page }) => {
  await go(page, 'F58:H59')
  await locate(page, 'Formulas')
  for (const coord of ['57:5', '58:5', '57:7', '58:7'])
    await expect(cell(page, coord)).toHaveAttribute('data-selected', 'true')
  await expect(cell(page, '57:4')).not.toHaveAttribute('data-selected')
  await expect(cell(page, '57:6')).toHaveCount(0)
})

for (const width of [1280, 390]) test(`locate dialog fits ${width}px with keyboard focus and Escape`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 850 })
  await go(page, 'A93:F94')
  await button(page, 'Go to special').focus()
  await page.keyboard.press('Enter')
  await expect(button(page, 'Constants')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(button(page, 'Cancel')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(button(page, 'Constants')).toBeFocused()
  const box = (await dialog(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: `/tmp/excel-locate-${width}.png` })
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(nameBox(page)).toHaveValue('A93:F94')
  await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
  await locate(page, 'Formulas')
  const note = page.getByRole('status', { name: 'Multi-area selection' })
  await expect(note).toContainText('3 cells selected')
  const noteBox = (await note.boundingBox())!
  expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(width)
  expect(await note.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: `/tmp/excel-locate-selected-${width}.png` })
  expect(errors).toEqual([])
})

const wasmBase = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} native locate handles a huge blank scope and refuses partial overflow`, async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const wasm = await import(url)
    await wasm.default()
    const book = new wasm.WasmWorkbook()
    const range = { rowStart: 0, colStart: 0, rowEnd: 1048575, colEnd: 16383 }
    try {
      const empty = book.locate_cells({ sheet: 0, range, kind: 'blanks', limit: 500 })
      for (let row = 0; row <= 1000; row += 2) book.set_cell_input(0, `A${row + 1}`, '1')
      let error = ''
      try { book.locate_cells({ sheet: 0, range, kind: 'constants', limit: 500 }) } catch (cause) {
        error = String(cause)
      }
      return { empty, error, unchanged: book.getCellDisplay(0, 'A1001') }
    } finally { book.free() }
  }, `${wasmBase}${variant}/einfach_wasm.js`)
  expect(result.empty.cellCount).toBe(17_179_869_184)
  expect(result.empty.ranges).toHaveLength(1)
  expect(result.error).toContain('smaller range')
  expect(result.unchanged).toBe('1')
})
