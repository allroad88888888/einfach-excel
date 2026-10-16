import { expect, test, type Page } from '@playwright/test'

const bodyCanvas = (page: Page) => page.locator('[data-workbook-grid] canvas')
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' })
async function setup(page: Page) {
  await page.addInitScript(() => {
    const texts: string[] = []
    Reflect.set(window, 'canvasTexts', texts)
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      texts.push(text)
      if (texts.length > 10000) texts.splice(0, 5000)
      if (maxWidth === undefined) original.call(this, text, x, y)
      else original.call(this, text, x, y, maxWidth)
    }
  })
  await page.goto('/?renderer=canvas')
  await expect(bodyCanvas(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'canvasTexts'))).toContain('SO-10001')
}
async function point(page: Page, col: number, row: number) {
  const box = (await bodyCanvas(page).boundingBox())!
  const rowStart = Number(await bodyCanvas(page).getAttribute('data-row-start'))
  const colStart = Number(await bodyCanvas(page).getAttribute('data-col-start'))
  const x = Number(await bodyCanvas(page).getAttribute('data-viewport-x'))
  const y = Number(await bodyCanvas(page).getAttribute('data-viewport-y'))
  return { x: box.x + (col - colStart) * 120 + 60 - x,
    y: box.y + (row - rowStart) * 28 + 14 - y }
}
async function go(page: Page, address: string) {
  await nameBox(page).fill(address)
  await nameBox(page).press('Enter')
  await expect(nameBox(page)).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('[data-workbook-grid]')).toBeFocused()
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}

test('Canvas paints the real workbook, selects by coordinates and edits through the existing editor', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await setup(page)
  await expect(page.locator('td[data-cell]')).toHaveCount(0)
  const p = await point(page, 0, 1)
  await page.mouse.click(p.x, p.y)
  await expect(nameBox(page)).toHaveValue('A2')
  await page.mouse.dblclick(p.x, p.y)
  const editor = page.getByRole('textbox', { name: 'Cell editor' })
  await expect(editor).toHaveValue('SO-10001')
  await editor.fill('CANVAS-EDIT')
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'canvasTexts'))).toContain('CANVAS-EDIT')
  await page.evaluate(() => { Reflect.get(window, 'canvasTexts').length = 0 })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'canvasTexts'))).toContain('SO-10001')
  await page.mouse.dblclick(p.x, p.y)
  await expect(editor).toHaveValue('SO-10001')
  await editor.press('Escape')
  expect(errors).toEqual([])
})

test('hover is local, dragging updates UI Core selection, and distant scrolling stays bounded', async ({ page }) => {
  await setup(page)
  const from = await point(page, 1, 1), to = await point(page, 3, 3)
  await page.mouse.move(from.x, from.y)
  await expect(bodyCanvas(page)).toHaveAttribute('data-painted-cells', '1')
  await page.mouse.move(from.x + 120, from.y)
  await expect(bodyCanvas(page)).toHaveAttribute('data-painted-cells', '2')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
  await expect(nameBox(page)).toHaveValue('B2:D4')
  await page.screenshot({ path: 'test-results/canvas-cells-selection.png' })
  await go(page, 'H900')
  const viewportHeight = await page.locator('.sheet-scroll').evaluate(el => el.clientHeight)
  const logicalHeight = await bodyCanvas(page).evaluate(el =>
    parseFloat((el as HTMLElement).style.height))
  expect(logicalHeight).toBeLessThanOrEqual(viewportHeight)
  expect(Number(await bodyCanvas(page).getAttribute('data-cell-count'))).toBeLessThan(5000)
  await page.keyboard.press('ArrowDown')
  await expect(nameBox(page)).toHaveValue('H901')
  await go(page, 'A2')
  const p = await point(page, 0, 1)
  await page.mouse.click(p.x, p.y)
  await expect(nameBox(page)).toHaveValue('A2')
})

test('frozen panes and merged text use Canvas and preserve their interaction coordinates', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await setup(page)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const frozen = page.locator('[data-frozen-pane="top"] canvas').first()
  await expect(frozen).toBeVisible()
  await expect(page.locator('td[data-cell], [data-merged-cell]')).toHaveCount(0)
  const box = (await frozen.boundingBox())!
  await page.mouse.click(box.x + 50, box.y + 15)
  await expect(nameBox(page)).toHaveValue('A1')
  await go(page, 'A15')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'canvasTexts'))).toContain('Merged heading')
  await page.screenshot({ path: 'test-results/canvas-cells-summary.png' })
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(page.locator('[data-frozen-pane] canvas')).toHaveCount(0)
  await expect(bodyCanvas(page)).toBeVisible()
  expect(errors).toEqual([])
})

test('painted filter buttons open the existing dialog without starting cell selection', async ({ page }) => {
  await setup(page)
  await go(page, 'A1:C10')
  await page.getByRole('combobox', { name: 'Worksheet filter' }).selectOption('selection')
  await expect(page.getByLabel('Filter status')).toBeVisible()
  const p = await point(page, 1, 0)
  await page.mouse.click(p.x + 49, p.y)
  await expect(page.getByRole('dialog', { name: 'Filter conditions', exact: true })).toBeVisible()
  await expect(page.getByLabel('Filter column 1', { exact: true })).toHaveValue('1')
  await expect(nameBox(page)).toHaveValue('A1:C10')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
