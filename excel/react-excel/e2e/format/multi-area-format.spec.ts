import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function selectConstants(page: Page) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill('A93:H94')
  await name.press('Enter')
  await button(page, 'Go to special').click()
  await button(page, 'Constants').click()
  await expect(page.getByRole('dialog', { name: 'Go to special' })).toBeHidden()
  await expect(page.getByRole('status', { name: 'Multi-area selection' }))
    .toContainText('Clear and formatting apply to all areas')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await selectConstants(page)
})

for (const [name, property, value] of [
  ['Bold', 'font-weight', '700'],
  ['Italic', 'font-style', 'normal'], // 活动格 A93 原本斜体：统一关闭全部选区的斜体。
  ['Underline', 'text-decoration-line', 'underline'],
  ['Text color', 'color', 'rgb(192, 0, 0)'],
  ['Fill color', 'background-color', 'rgb(255, 242, 204)'],
]) test(`${name} changes every area, preserves the gap and undoes once`, async ({ page }) => {
  const originals = await Promise.all(['92:0', '92:4', '93:0', '92:3'].map((coord) =>
    cell(page, coord).evaluate((node, css) =>
      getComputedStyle(node).getPropertyValue(css), property)))
  await button(page, name).click()
  for (const coord of ['92:0', '92:4', '93:0']) await expect(cell(page, coord)).toHaveCSS(property, value)
  await expect(cell(page, '92:3')).toHaveCSS(property, originals[3])
  await expect(cell(page, '92:3')).toHaveText('20')
  await button(page, 'Undo').click()
  await expect(button(page, 'Undo')).toBeDisabled()
  for (const [index, coord] of ['92:0', '92:4', '93:0'].entries())
    await expect(cell(page, coord)).toHaveCSS(property, originals[index])
  await button(page, 'Redo').click()
  await expect(cell(page, '92:4')).toHaveCSS(property, value)
  await expect(button(page, 'Redo')).toBeDisabled()
})

test('number format changes numeric displays in all areas without changing text, booleans or gap formulas', async ({ page }) => {
  await button(page, 'Percent format').click()
  await expect(cell(page, '92:0')).toHaveText('1000%')
  await expect(cell(page, '92:7')).toHaveText('25%')
  await expect(cell(page, '92:4')).toHaveText('30')
  await expect(cell(page, '92:5')).toHaveText('TRUE')
  await expect(cell(page, '92:3')).toHaveText('20')
  await expect(cell(page, '92:0')).toHaveCSS('font-style', 'italic')
  await button(page, 'Undo').click()
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(cell(page, '92:7')).toHaveText('0.25')
  await button(page, 'Redo').click()
  await expect(cell(page, '92:7')).toHaveText('25%')
})

test('multi-area font size changes only selected rows and restores their geometry with one undo', async ({ page }) => {
  const before = (await cell(page, '92:0').boundingBox())!.height
  const nextRow = (await cell(page, '94:0').boundingBox())!.height
  await page.getByRole('combobox', { name: 'Font size', exact: true }).selectOption('36')
  await expect(cell(page, '92:0')).toHaveCSS('font-size', '36px')
  await expect(cell(page, '93:0')).toHaveCSS('font-size', '36px')
  await expect(cell(page, '92:3')).toHaveCSS('font-size', '12px')
  await expect.poll(async () => (await cell(page, '92:0').boundingBox())?.height).toBeGreaterThan(36)
  expect((await cell(page, '94:0').boundingBox())!.height).toBe(nextRow)
  await button(page, 'Undo').click()
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect.poll(async () => (await cell(page, '92:0').boundingBox())?.height).toBe(before)
})

test('an invalid later area rejects the entire native format and the same dialog can retry', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    let rejectOnce = true
    Worker.prototype.postMessage = function (
      message: { command?: string; payload?: { request: { targets?: { rowEnd: number }[] } } },
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (rejectOnce && message.command === 'format.setRange' && message.payload?.request.targets) {
        rejectOnce = false
        message = { ...message, payload: { ...message.payload, request: {
          ...message.payload.request,
          targets: message.payload.request.targets.map((target, index) =>
            index === 1 ? { ...target, rowEnd: 1_048_576 } : target),
        } } }
      }
      post.call(this, message, Array.isArray(options) ? { transfer: options } : (options ?? {}))
    }
  })
  await page.reload()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await selectConstants(page)
  await button(page, 'Number format settings').click()
  await page.getByRole('combobox', { name: 'Number format category' }).selectOption('percent')
  await button(page, 'Apply number format').click()
  await expect(page.getByRole('alert')).toContainText('Check the cells before retrying')
  await expect(cell(page, '92:0')).toHaveText('10')
  await expect(cell(page, '92:7')).toHaveText('0.25')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Apply number format').click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(cell(page, '92:7')).toHaveText('25.00%')
  await button(page, 'Undo').click()
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(cell(page, '92:7')).toHaveText('0.25')
})

for (const width of [1280, 390]) test(`number settings apply across areas and preserve keyboard access at ${width}px`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 850 })
  await button(page, 'Number format settings').focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Number format', exact: true })
  await page.getByRole('combobox', { name: 'Number format category' }).selectOption('currency')
  await page.getByRole('spinbutton', { name: 'Decimal places', exact: true }).fill('3')
  const bounds = (await dialog.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: `/tmp/excel-multi-format-panel-${width}.png` })
  await button(page, 'Apply number format').click()
  await expect(dialog).toBeHidden()
  await expect(cell(page, '92:0')).toHaveText('$10.000')
  await page.locator('.sheet-scroll').evaluate((node) => { node.scrollLeft = node.scrollWidth })
  await expect(cell(page, '92:7')).toHaveText('$0.250')
  await page.screenshot({ path: `/tmp/excel-multi-format-result-${width}.png` })
  await button(page, 'Undo').click()
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(cell(page, '92:7')).toHaveText('0.25')
  expect(errors).toEqual([])
})
