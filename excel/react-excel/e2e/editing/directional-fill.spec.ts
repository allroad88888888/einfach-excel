import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const menu = (page: Page) => page.getByRole('combobox', { name: 'Fill selected range' })
const input = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
async function select(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}
async function fill(page: Page, direction: 'down' | 'right') {
  await menu(page).selectOption(direction)
  await expect(page.getByLabel('Fill status')).toHaveText(`Filled ${direction}.`)
}
async function write(page: Page, address: string, value: string) {
  await select(page, address)
  await input(page).fill(value)
  await input(page).press('Enter')
  await select(page, address)
  await expect(input(page)).toHaveValue(value)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A70')
  await expect(cell(page, '69:0')).toHaveText('Fill examples')
})

test('seed formula fills down with relative/absolute references and one undo step', async ({ page }) => {
  await select(page, 'B71:B73')
  await expect(cell(page, '70:1')).toHaveText('4')
  await expect(cell(page, '70:1')).toHaveCSS('font-weight', '700')
  await fill(page, 'down')
  await expect(cell(page, '71:1')).toHaveText('5')
  await expect(cell(page, '72:1')).toHaveText('6')
  await expect(cell(page, '72:1')).toHaveCSS('font-weight', '700')
  await select(page, 'B73')
  await expect(input(page)).toHaveValue('=(A73+$A$71)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '71:1')).toHaveText('')
  await expect(cell(page, '72:1')).toHaveText('')
  await expect(cell(page, '70:1')).toHaveText('4')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '72:1')).toHaveText('6')
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toHaveAttribute('aria-selected', 'true')
})

test('fill right copies seed text and underline, then shifts a formula horizontally', async ({ page }) => {
  await select(page, 'D71:F71')
  await expect(cell(page, '70:3')).toHaveCSS('text-decoration-line', 'underline')
  await fill(page, 'right')
  for (const col of [3, 4, 5]) {
    await expect(cell(page, `70:${col}`)).toHaveText('Fill me')
    await expect(cell(page, `70:${col}`)).toHaveCSS('text-decoration-line', 'underline')
  }
  await write(page, 'D72', '=A71+$A$71')
  await select(page, 'D72:F72')
  await fill(page, 'right')
  await select(page, 'F72')
  await expect(input(page)).toHaveValue('=(C71+$A$71)')
  await expect(cell(page, '71:5')).toHaveText('2')
})

for (const modifier of ['Control', 'Meta']) {
  test(`${modifier}+D/R fill only when the grid is focused`, async ({ page }) => {
    await select(page, 'B71:B73')
    await page.keyboard.press(`${modifier}+d`)
    await expect(cell(page, '72:1')).toHaveText('6')
    await select(page, 'D71:F71')
    await page.keyboard.press(`${modifier}+r`)
    await expect(cell(page, '70:5')).toHaveText('Fill me')
    await select(page, 'D73:F73')
    await input(page).fill('draft')
    await expect(menu(page)).toBeDisabled()
    // DOM 事件验证输入框的默认行为没有被 grid 接管；不触发浏览器刷新。
    const prevented = await input(page).evaluate((element, mod) => {
      const event = new KeyboardEvent('keydown', {
        key: 'r', ctrlKey: mod === 'Control', metaKey: mod === 'Meta', bubbles: true, cancelable: true,
      })
      element.dispatchEvent(event)
      return event.defaultPrevented
    }, modifier)
    expect(prevented).toBe(false)
    await input(page).press('Escape')
    await expect(cell(page, '72:5')).toHaveText('')
  })
}

test('blank clears destination and plain source overrides inherited column styles', async ({ page }) => {
  await page.getByRole('columnheader', { name: 'Select column E', exact: true }).click()
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await write(page, 'D75', '0')
  await select(page, 'D75:E75')
  await fill(page, 'right')
  await expect(cell(page, '74:4')).toHaveText('0')
  await expect(cell(page, '74:4')).toHaveCSS('font-weight', '400')
  await expect(cell(page, '75:4')).toHaveCSS('font-weight', '700')
  await select(page, 'D74:D75')
  await fill(page, 'down')
  await expect(cell(page, '74:3')).toHaveText('')
  await expect(cell(page, '74:4')).toHaveText('0')
})

test('single cell and merged destinations fail visibly without damaging data or history', async ({ page }) => {
  await select(page, 'A71')
  await menu(page).selectOption('down')
  await expect(page.getByRole('alert', { name: 'Fill status' })).toContainText('Include a source')
  await select(page, 'A14:D15')
  await menu(page).selectOption('down')
  await expect(page.getByRole('alert', { name: 'Fill status' })).toContainText('unmerge')
  await expect(cell(page, '14:0')).toHaveText('Merged heading')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await select(page, 'B71:B73')
  await fill(page, 'down')
  await expect(cell(page, '72:1')).toHaveText('6')
})

test('fills offscreen rows including hidden rows and restores row heights on undo', async ({ page }) => {
  await write(page, 'E2', 'Tall')
  await page.getByRole('combobox', { name: 'Font size', exact: true }).selectOption('36')
  await select(page, 'E2:E100')
  await fill(page, 'down')
  await select(page, 'E100')
  await expect(cell(page, '99:4')).toHaveText('Tall')
  await expect(cell(page, '99:4')).toHaveCSS('font-size', '36px')
  expect((await cell(page, '99:4').boundingBox())!.height).toBeGreaterThan(36)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '99:4')).toHaveText('')
  expect((await cell(page, '99:4').boundingBox())!.height).toBeLessThan(36)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('unhide-all')
  await select(page, 'E10')
  await expect(cell(page, '9:4')).toHaveText('Tall')
})

test('fill leaves the existing copy snapshot untouched', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await select(page, 'A71')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByLabel('Clipboard status')).toContainText('Copied')
  await select(page, 'B71:D73')
  await fill(page, 'down')
  await expect(cell(page, '72:1')).toHaveText('6')
  await expect(cell(page, '72:2')).toHaveText('')
  await expect(cell(page, '72:3')).toHaveText('Fill me')
  await select(page, 'H75')
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(cell(page, '74:7')).toHaveText('2')
  await select(page, 'A71')
  await expect(cell(page, '70:0')).toHaveText('2')
})

test('fills all 1,000 sales records through Rust and restores them in one undo', async ({ page }) => {
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'A2:A1001')
  await fill(page, 'down')
  await select(page, 'A1001')
  await expect(cell(page, '1000:0')).toHaveText('SO-10001')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1000:0')).toHaveText('SO-11000')
  await select(page, 'A2')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const width of [1280, 390]) {
  test(`fill controls and feedback remain usable at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 800 })
    await select(page, 'B71:B73')
    await menu(page).scrollIntoViewIfNeeded()
    await expect(menu(page)).toBeInViewport()
    await fill(page, 'down')
    await page.getByLabel('Fill status').scrollIntoViewIfNeeded()
    await expect(page.getByLabel('Fill status')).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`fill-${width}.png`) })
    expect(errors).toEqual([])
  })
}
