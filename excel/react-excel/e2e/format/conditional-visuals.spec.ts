import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Conditional formatting', exact: true })
const input = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
const low = 'rgb(248, 105, 107)'
const high = 'rgb(99, 190, 123)'
async function go(page: Page, reference: string) {
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill(reference)
  await button(page, 'Go').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(input(page)).toBeEnabled()
}
async function write(page: Page, address: string, value: string) {
  await go(page, address); await input(page).fill(value); await input(page).press('Enter')
}
async function open(page: Page) { await button(page, 'Conditional formatting').click() }
async function save(page: Page, edit = false) {
  await button(page, edit ? 'Save rule' : 'Add rule').click()
  await expect(dialog(page)).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await go(page, 'C75:E79')
})

test('native seed displays both color scales and mixed-sign bars without creating history', async ({ page }) => {
  for (const col of [2, 3]) {
    await expect(cell(page, `74:${col}`)).toHaveCSS('background-color', low)
    await expect(cell(page, `78:${col}`)).toHaveCSS('background-color', high)
  }
  await expect(cell(page, '76:3')).toHaveCSS('background-color', 'rgb(255, 235, 132)')
  const negative = cell(page, '74:4').locator('.cell-data-bar-fill')
  await expect(negative).toHaveCSS('background-color', low)
  expect(await negative.evaluate((node: HTMLElement) => parseFloat(node.style.width)))
    .toBeCloseTo(100 / 3)
  const positive = cell(page, '78:4').locator('.cell-data-bar-fill')
  expect(await positive.evaluate((node: HTMLElement) => parseFloat(node.style.width)))
    .toBeCloseTo(200 / 3)
  await expect(cell(page, '75:4').locator('.cell-data-bar-fill')).toHaveCSS('width', '0px')
  await expect(cell(page, '74:4')).toHaveText('-10')
  await expect(button(page, 'Undo')).toBeDisabled()
})

// 从既有数值/规则开始，颜色与种子不同，才能观察本次真实写入及完整撤销。
for (const width of [1280, 390]) for (const colors of ['2', '3'])
  test(`${colors}-color scale applies independently and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await go(page, 'C65:C67')
    const cells = [64, 65, 66].map(row => cell(page, `${row}:2`))
    const baseline = await Promise.all(cells.map(target => target
      .evaluate(node => getComputedStyle(node).backgroundColor)))
    const expected = ['rgb(0, 0, 0)', colors === '2' ? 'rgb(128, 128, 128)' : 'rgb(0, 0, 255)',
      'rgb(255, 255, 255)']
    await open(page)
    await page.getByLabel('Rule type').selectOption('color-scale')
    await page.getByLabel('Scale colors').selectOption(colors)
    await page.getByLabel('Minimum color').fill('#000000')
    await page.getByLabel('Maximum color').fill('#ffffff')
    if (colors === '3') await page.getByLabel('Midpoint color').fill('#0000ff')
    await save(page)
    for (const [index, target] of cells.entries()) {
      await expect(target).toHaveCSS('background-color', expected[index]!)
      await expect(target).toHaveText(String((index + 1) * 2))
    }
    await expect(cell(page, '65:3')).toHaveCSS('background-color', 'rgb(217, 234, 247)')
    await button(page, 'Undo').click()
    for (const [index, target] of cells.entries())
      await expect(target).toHaveCSS('background-color', baseline[index]!)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    for (const [index, target] of cells.entries())
      await expect(target).toHaveCSS('background-color', expected[index]!)
    await open(page); await button(page, 'Edit rule 1').click()
    await expect(page.getByLabel('Applies to')).toHaveValue('C65:C67')
    await expect(page.getByLabel('Scale colors')).toHaveValue(colors)
    await expect(page.getByLabel('Minimum color')).toHaveValue('#000000')
    await expect(page.getByLabel('Maximum color')).toHaveValue('#ffffff')
    if (colors === '3') await expect(page.getByLabel('Midpoint color')).toHaveValue('#0000ff')
  })

for (const width of [1280, 390])
  test(`data bar applies independently and undoes once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await go(page, 'C75:C79'); await open(page)
    await page.getByLabel('Rule type').selectOption('data-bar')
    await page.getByLabel('Negative bar color').fill('#654321')
    await page.getByLabel('Positive bar color').fill('#123456')
    await save(page)
    const negative = cell(page, '74:2').locator('.cell-data-bar-fill')
    const positive = cell(page, '78:2').locator('.cell-data-bar-fill')
    await expect(negative).toHaveCSS('background-color', 'rgb(101, 67, 33)')
    await expect(positive).toHaveCSS('background-color', 'rgb(18, 52, 86)')
    await expect(cell(page, '74:2')).toHaveText('-10')
    await expect(cell(page, '78:2')).toHaveText('20')
    await expect(cell(page, '74:2')).toHaveCSS('background-color', low)
    await expect(cell(page, '74:3').locator('[data-data-bar]')).toHaveCount(0)
    await expect(cell(page, '74:4').locator('.cell-data-bar-fill')).toHaveCSS('background-color', low)
    await button(page, 'Undo').click()
    await expect(negative).toHaveCount(0); await expect(positive).toHaveCount(0)
    await expect(cell(page, '74:2')).toHaveCSS('background-color', low)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(negative).toHaveCSS('background-color', 'rgb(101, 67, 33)')
    await expect(positive).toHaveCSS('background-color', 'rgb(18, 52, 86)')
    await open(page); await button(page, 'Edit rule 1').click()
    await expect(page.getByLabel('Applies to')).toHaveValue('C75:C79')
    await expect(page.getByLabel('Negative bar color')).toHaveValue('#654321')
    await expect(page.getByLabel('Positive bar color')).toHaveValue('#123456')
  })

test('two-color rule uses offscreen values, edits recalculate, and undo restores the full scale', async ({ page }) => {
  await write(page, 'F75', '0'); await write(page, 'F76', '50'); await write(page, 'F99', '100')
  await go(page, 'F75'); await open(page)
  await page.getByLabel('Applies to').fill('F75:F99')
  await page.getByLabel('Rule type').selectOption('color-scale')
  await page.getByLabel('Minimum color').fill('#000000')
  await page.getByLabel('Maximum color').fill('#ffffff'); await save(page)
  await expect(cell(page, '75:5')).toHaveCSS('background-color', 'rgb(128, 128, 128)')
  await write(page, 'F99', '200'); await go(page, 'F76')
  await expect(cell(page, '75:5')).toHaveCSS('background-color', 'rgb(64, 64, 64)')
  await button(page, 'Undo').click()
  await expect(cell(page, '75:5')).toHaveCSS('background-color', 'rgb(128, 128, 128)')
})

test('three-color rule changes its midpoint color and can switch to two colors without stale fields', async ({ page }) => {
  await open(page); await button(page, 'Edit rule 7').click()
  await expect(page.getByLabel('Scale colors')).toHaveValue('3')
  await page.getByLabel('Midpoint color').fill('#0000ff'); await save(page, true)
  await expect(cell(page, '76:3')).toHaveCSS('background-color', 'rgb(0, 0, 255)')
  await open(page); await button(page, 'Edit rule 7').click()
  await page.getByLabel('Scale colors').selectOption('2'); await save(page, true)
  await expect(cell(page, '76:3')).not.toHaveCSS('background-color', 'rgb(0, 0, 255)')
  await button(page, 'Undo').click()
  await expect(cell(page, '76:3')).toHaveCSS('background-color', 'rgb(0, 0, 255)')
})

test('data-bar disable, recolor, delete and undo update visuals without changing values', async ({ page }) => {
  await open(page); await button(page, 'Disable rule 8').click()
  await expect(cell(page, '74:4').locator('[data-data-bar]')).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(cell(page, '74:4').locator('[data-data-bar]')).toHaveCount(1)
  await open(page); await button(page, 'Edit rule 8').click()
  await page.getByLabel('Negative bar color').fill('#123456'); await save(page, true)
  await expect(cell(page, '74:4').locator('.cell-data-bar-fill')).toHaveCSS('background-color', 'rgb(18, 52, 86)')
  await open(page); await button(page, 'Delete rule 8').click()
  await expect(cell(page, '74:4').locator('[data-data-bar]')).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(cell(page, '74:4')).toHaveText('-10')
  await expect(cell(page, '74:4').locator('.cell-data-bar-fill')).toHaveCSS('background-color', 'rgb(18, 52, 86)')
})

test('bar range follows structural history and rejects text as a numeric member', async ({ page }) => {
  await go(page, 'E75')
  await page.getByRole('combobox', { name: 'Insert or delete rows and columns' }).selectOption('insert-rows')
  await expect(cell(page, '75:4').locator('[data-data-bar]')).toHaveCount(1)
  await open(page); await button(page, 'Edit rule 8').click()
  await expect(page.getByLabel('Applies to')).toHaveValue('E76:E80')
  await button(page, 'Cancel').click(); await button(page, 'Undo').click()
  await write(page, 'E75', "'-10")
  await expect(cell(page, '74:4').locator('[data-data-bar]')).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(cell(page, '74:4').locator('[data-data-bar]')).toHaveCount(1)
})

test('merged anchor renders one bar across the full merged width', async ({ page }) => {
  await go(page, 'E79:F79')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  const merged = page.locator('[data-merged-cell="true"][data-cell="78:4"]')
  await expect(merged).toBeVisible()
  await expect(merged.locator('[data-data-bar]')).toHaveCount(1)
  await expect(cell(page, '78:4').locator('[data-data-bar]')).toHaveCount(0)
  const host = await merged.boundingBox()
  const fill = await merged.locator('.cell-data-bar-fill').boundingBox()
  expect(fill!.width / (host!.width - 4)).toBeCloseTo(2 / 3, 1)
  await button(page, 'Undo').click()
  await expect(cell(page, '78:4').locator('[data-data-bar]')).toHaveCount(1)
})

test('frozen numeric cell keeps its bar while scrolling away', async ({ page }) => {
  await write(page, 'A1', '-10'); await write(page, 'A2', '0'); await write(page, 'A3', '20')
  await go(page, 'A1:A3'); await open(page)
  await page.getByLabel('Rule type').selectOption('data-bar'); await save(page)
  await go(page, 'A90')
  const frozen = page.locator('[data-frozen-pane="top"] td[data-cell="0:0"]')
  await expect(frozen).toHaveText('-10')
  await expect(frozen.locator('[data-data-bar]')).toHaveCount(1)
})

test('ordinary copy pastes base formatting, not the conditional bar', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await go(page, 'E75'); await button(page, 'Copy').click()
  await go(page, 'F75'); await button(page, 'Paste').click()
  await expect(cell(page, '74:5')).toHaveText('-10')
  await expect(cell(page, '74:5').locator('[data-data-bar]')).toHaveCount(0)
  await expect(cell(page, '74:4').locator('[data-data-bar]')).toHaveCount(1)
})

for (const width of [1280, 390]) test(`visual rule forms fit ${width}px and return keyboard focus`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 800 })
  await go(page, 'E75'); await page.screenshot({ path: info.outputPath(`visual-grid-${width}.png`), fullPage: true })
  await open(page)
  for (const kind of ['color-scale', 'data-bar']) {
    await page.getByLabel('Rule type').selectOption(kind)
    if (kind === 'color-scale') await page.getByLabel('Scale colors').selectOption('3')
    expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    await expect(button(page, 'Add rule')).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`${kind}-${width}.png`), fullPage: true })
  }
  await page.getByLabel('Positive bar color').press('Escape')
  await expect(button(page, 'Conditional formatting')).toBeFocused()
  expect(errors).toEqual([])
})
