import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
async function go(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(bar(page)).toBeEnabled()
}
async function details(page: Page, address: string) {
  await go(page, address)
  await button(page, 'Spill details').click()
  await expect(page.getByText('Reading spill details…')).toBeHidden()
  return page.getByRole('dialog', { name: 'Spill details' })
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
})

test('seed spill child reveals the native range, selection and formula anchor without history', async ({ page }) => {
  const dialog = await details(page, 'F58')
  await expect(dialog).toContainText('Formula cell: F57')
  await expect(dialog).toContainText('Spill range: F57:F59')
  await expect(dialog).toContainText('Size: 3 × 1 (rows × columns)')
  await button(page, 'Select spill range').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('F57:F59')
  await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
  await expect(button(page, 'Undo')).toBeDisabled()
  await details(page, 'F59')
  await button(page, 'Go to formula cell').click()
  await expect(bar(page)).toHaveValue('=H57#*10')
})

test('native arithmetic array remains a spill when source shrinks to one and grows back with undo', async ({ page }) => {
  await go(page, 'H57')
  await bar(page).fill('=SEQUENCE(1)')
  await bar(page).press('Enter')
  await expect(cell(page, '57:5')).toHaveText('')
  await go(page, 'H63')
  await expect(cell(page, '62:7')).toHaveText('10')
  const dialog = await details(page, 'F57')
  await expect(dialog).toContainText('Spill range: F57')
  await expect(dialog).toContainText('Size: 1 × 1 (rows × columns)')
  await button(page, 'Select spill range').click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('F57')
  await button(page, 'Undo').click()
  await expect(cell(page, '58:5')).toHaveText('30')
  await go(page, 'H63')
  await expect(cell(page, '62:7')).toHaveText('60')
  await button(page, 'Redo').click()
  await expect(cell(page, '62:7')).toHaveText('10')
})

test('locating a blocker preserves content; clear resolves and undo restores the native error', async ({ page }) => {
  const dialog = await details(page, 'F62')
  await expect(dialog).toContainText('Blocked by F63.')
  await button(page, 'Select blocking cell').click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('F63')
  await expect(bar(page)).toHaveValue('Clear to unblock')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Clear contents').click()
  await expect(cell(page, '61:5')).toHaveText('1')
  await expect(cell(page, '63:5')).toHaveText('3')
  await details(page, 'F63')
  await expect(dialog).toContainText('Spill range: F62:F64')
  await button(page, 'Close').click()
  await button(page, 'Undo').click()
  await expect(cell(page, '61:5')).toHaveText('#SPILL!')
  await expect(cell(page, '62:5')).toHaveText('Clear to unblock')
})

test('two-dimensional spill locates a frozen anchor and retains hidden columns', async ({ page }) => {
  await go(page, 'E1')
  await bar(page).fill('=SEQUENCE(3,4)')
  await bar(page).press('Enter')
  // G1 本来就有隐藏列样例；定位它不能顺便取消隐藏或删除其内容。
  await expect(cell(page, '0:4')).toHaveText('#SPILL!')
  await details(page, 'E1')
  await expect(page.getByRole('dialog')).toContainText('Blocked by G1.')
  await button(page, 'Select blocking cell').click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('G1')
  await expect(bar(page)).toHaveValue('Hidden column example')
  await button(page, 'Clear contents').click()
  await expect(cell(page, '2:7')).toHaveText('12')
  const dialog = await details(page, 'H3')
  await expect(dialog).toContainText('Spill range: E1:H3')
  await expect(dialog).toContainText('Size: 3 × 4 (rows × columns)')
  await button(page, 'Select spill range').click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('E1:H3')
  await expect(cell(page, '0:4')).toHaveText('1')
  await expect(cell(page, '1:6')).toHaveCount(0)
  await details(page, 'H3')
  await button(page, 'Go to formula cell').click()
  await expect(bar(page)).toHaveValue('=SEQUENCE(3,4)')
  await expect(cell(page, '1:6')).toHaveCount(0)
})

test('ordinary cells and drafts do not fabricate array information', async ({ page }) => {
  const dialog = await details(page, 'B2')
  await expect(dialog).toContainText('This cell is not part of a spilled array.')
  await expect(button(page, 'Select spill range')).toHaveCount(0)
  await button(page, 'Close').click()
  await bar(page).fill('=SUM(')
  await expect(button(page, 'Spill details')).toBeDisabled()
  await expect(bar(page)).toHaveValue('=SUM(')
  await bar(page).press('Escape')
})

for (const width of [1280, 390]) test(`spill details fit ${width}px with keyboard focus and no page errors`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 850 })
  await go(page, 'F58')
  await button(page, 'Spill details').focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Spill details' })
  await expect(dialog).toContainText('Spill range: F57:F59')
  await expect(button(page, 'Close')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(button(page, 'Select spill range')).toBeFocused()
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  await page.screenshot({ path: `/tmp/excel-spill-${width}.png` })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(errors).toEqual([])
})

const wasmBase = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} artifact preserves one-cell spill geometry and native blocker`, async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const wasm = await import(url)
    await wasm.default()
    const book = new wasm.WasmWorkbook()
    try {
      book.set_cell_input(0, 'A1', '=SEQUENCE(1)')
      book.set_cell_input(0, 'C1', '=A1#*10')
      book.set_cell_input(0, 'E1', '=SUM(C1#)')
      book.set_cell_input(0, 'G2', 'keep')
      book.set_cell_input(0, 'G1', '=SEQUENCE(3)')
      return { shape: Array.from(book.spillInfo(0, 'C1')), sum: book.getCellDisplay(0, 'E1'),
        blocker: book.spillBlocker(0, 'G1'), error: book.getCellDisplay(0, 'G1') }
    } finally { book.free() }
  }, `${wasmBase}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ shape: [1, 1], sum: '10', blocker: 'G2', error: '#SPILL!' })
})
