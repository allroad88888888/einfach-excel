import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const menu = (page: Page) =>
  page.getByRole('combobox', {
    name: 'Insert or delete rows and columns',
  })
async function structure(page: Page, action: string) {
  await menu(page).selectOption(action)
  await expect(menu(page)).toBeEnabled()
  await expect(menu(page)).toHaveValue('')
  await expect(page.getByRole('alert')).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('insert selected rows moves native cells, formulas and styles; undo and redo restore them', async ({
  page,
}) => {
  await select(page, 'A2:A3', '1:0')
  await structure(page, 'insert-rows')
  await expect(cell(page, '1:0')).toHaveText('')
  await expect(cell(page, '2:0')).toHaveText('')
  await expect(cell(page, '3:0')).toHaveText('SO-10001')
  await expect(cell(page, '3:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '3:6')).toHaveText('79')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '3:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText('79')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText('79')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'A2', '1:0')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('insert selected columns moves formulas and underline, and delete columns reverses the shift', async ({
  page,
}) => {
  await select(page, 'B2:C2', '1:1')
  await structure(page, 'insert-columns')
  await expect(cell(page, '1:1')).toHaveText('')
  await expect(cell(page, '1:3')).toHaveText('Acme Co.')
  await expect(cell(page, '1:3')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '1:4')).toHaveCSS('text-decoration-line', 'underline')
  await select(page, 'I2', '1:8')
  await expect(cell(page, '1:8')).toHaveText('79')
  await select(page, 'B2:C2', '1:1')
  await structure(page, 'delete-columns')
  await expect(cell(page, '1:1')).toHaveText('Acme Co.')
  await expect(cell(page, '1:6')).toHaveText('79')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1:3')).toHaveText('Acme Co.')
})

test('delete rows removes data, exposes reference errors and undo restores cross-sheet values', async ({
  page,
}) => {
  await select(page, 'A2', '1:0')
  await structure(page, 'delete-rows')
  await expect(cell(page, '1:0')).toHaveText('SO-10002')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText('#REF!')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText('79')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'A2', '1:0')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('tail deletion clamps the selected cell and keyboard boundary to the resized canvas', async ({
  page,
}) => {
  await select(page, 'P1001', '1000:15')
  await structure(page, 'delete-rows')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('P1000')
  await expect(cell(page, '999:15')).toBeInViewport()
  await structure(page, 'delete-columns')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('O1000')
  await expect(cell(page, '999:14')).toBeInViewport()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(
    page.getByRole('columnheader', { name: 'Select column P', exact: true }),
  ).toHaveCount(1)
  await page.locator('[data-workbook-grid]').press('ControlOrMeta+ArrowRight')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('P1000')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-row-count', '1001')
  await page.locator('[data-workbook-grid]').press('ControlOrMeta+ArrowDown')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('P1001')
  await expect(cell(page, '1000:15')).toBeInViewport()
})

test('delete all rows is rejected without losing data, then the menu remains usable', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Select all cells' }).click()
  await menu(page).selectOption('delete-rows')
  await expect(page.getByRole('alert')).toContainText('Keep at least one row')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'A2', '1:0')
  await structure(page, 'insert-rows')
  await expect(cell(page, '2:0')).toHaveText('SO-10001')
})

test('structure menu is reachable on desktop and narrow screens', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await select(page, 'A2', '1:0')
    await structure(page, 'insert-rows')
    await expect(cell(page, '2:0')).toHaveText('SO-10001')
    await menu(page).scrollIntoViewIfNeeded()
    await menu(page).focus()
    await expect(menu(page)).toBeFocused()
    const hit = await menu(page).evaluate((el) => {
      const r = el.getBoundingClientRect()
      return {
        width: r.width,
        height: r.height,
        top: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }
    })
    expect(hit).toMatchObject({ top: true, overflow: false })
    expect(hit.width).toBeGreaterThan(100)
    expect(hit.height).toBeGreaterThanOrEqual(24)
    await page.screenshot({ path: info.outputPath(`structure-${width}.png`) })
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
  }
  expect(errors).toEqual([])
})

test('Summary native sizes and hidden seed indices move with inserted rows and columns', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await select(page, 'A1', '0:0')
  await structure(page, 'insert-rows')
  await expect(cell(page, '1:0')).toHaveText('First order total')
  await structure(page, 'insert-columns')
  await expect(cell(page, '1:1')).toHaveText('First order total')
  await expect.poll(async () => (await cell(page, '1:1').boundingBox())?.height).toBe(40)
  await expect.poll(async () => (await cell(page, '1:1').boundingBox())?.width).toBe(200)
  await expect(cell(page, '10:1')).toHaveCount(0)
  await expect(cell(page, '1:7')).toHaveCount(0)
  const visibility = page.getByRole('combobox', { name: 'Row and column visibility' })
  await visibility.selectOption('unhide-all')
  await expect(cell(page, '10:1')).toHaveText('Hidden row example')
  await select(page, 'H2', '1:7')
  await expect(cell(page, '1:7')).toHaveText('Hidden column example')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1:7')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A2', '1:0')
  await expect(cell(page, '1:0')).toHaveText('First order total')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())?.height).toBe(40)
})

test('an offscreen row height moves with data and is restored by structural undo', async ({
  page,
}) => {
  await select(page, 'A900', '899:0')
  await page.getByRole('button', { name: 'Row and column size', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Row height' }).fill('64')
  await page.getByRole('button', { name: 'Set row height' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await select(page, 'A2:A3', '1:0')
  await structure(page, 'insert-rows')
  await select(page, 'A902', '901:0')
  await expect(cell(page, '901:0')).toHaveText('SO-10899')
  await expect.poll(async () => (await cell(page, '901:0').boundingBox())?.height).toBe(64)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '901:0')).toHaveText('SO-10901')
  await expect.poll(async () => (await cell(page, '901:0').boundingBox())?.height).toBe(28)
  await select(page, 'A900', '899:0')
  await expect(cell(page, '899:0')).toHaveText('SO-10899')
  await expect.poll(async () => (await cell(page, '899:0').boundingBox())?.height).toBe(64)
})
