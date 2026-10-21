import { expect, test, type Page } from '@playwright/test'
import { select, copy, paste } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const opener = (page: Page) => page.getByRole('button', { name: 'Border settings', exact: true })
async function open(page: Page, preset = 'outside', style = 'thin', color = '#c00000') {
  await opener(page).click()
  await page.getByLabel('Position', { exact: true }).selectOption(preset)
  if (preset !== 'none') {
    await page.getByLabel('Line style', { exact: true }).selectOption(style)
    await page.getByLabel('Hex color', { exact: true }).fill(color)
  }
}
async function apply(page: Page) {
  await page.getByRole('button', { name: 'Apply borders', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Borders', exact: true })).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const preset of ['outside', 'inside', 'all', 'horizontal', 'vertical', 'top', 'right', 'bottom', 'left', 'none']) {
  test(`${preset} uses selection edges, not every cell perimeter`, async ({ page }) => {
    await select(page, 'C10:E12', '9:2')
    const before = await cell(page, '10:3').textContent()
    if (preset === 'none') { await open(page, 'all'); await apply(page) }
    await open(page, preset)
    await apply(page)
    // 检查可见单边所有权；相同的内部边只绘制前一格的右／下边。
    const checks = [
      ['9:2', 'top', ['outside', 'all', 'top']],
      ['9:2', 'left', ['outside', 'all', 'left']],
      ['9:4', 'right', ['outside', 'all', 'right']],
      ['11:3', 'bottom', ['outside', 'all', 'bottom']],
      ['10:3', 'right', ['inside', 'all', 'vertical']],
      ['10:3', 'bottom', ['inside', 'all', 'horizontal']],
    ] as const
    for (const [coord, side, matches] of checks) {
      const value = await cell(page, coord).evaluate((element, edge) =>
        getComputedStyle(element).getPropertyValue(`border-${edge}-color`), side)
      expect(value === 'rgb(192, 0, 0)', `${coord} ${side}`).toBe((matches as readonly string[]).includes(preset))
    }
    await expect(cell(page, '10:3')).toHaveText(before!)
    await select(page, 'C9', '8:2')
    await expect(cell(page, '8:2')).not.toHaveCSS('border-top-color', 'rgb(192, 0, 0)')
  })
}

for (const viewportWidth of [1280, 390]) {
  for (const [style, css, width] of [
    ['thin', 'solid', '1px'], ['medium', 'solid', '2px'], ['thick', 'solid', '3px'],
    ['dashed', 'dashed', '1px'], ['dotted', 'dotted', '1px'], ['double', 'double', '3px'],
  ] as const) test(`${style} border has exact width and one undo step at ${viewportWidth}px`, async ({ page }, info) => {
    await page.setViewportSize({ width: viewportWidth, height: 850 })
    await select(page, 'C10:D11', '9:2')
    const height = (await cell(page, '9:2').boundingBox())!.height
    const before = await cell(page, '9:2').innerText()
    await open(page, 'all', style)
    await apply(page)
    // 上沿由上邻格的底边绘制；断言真实线宽，而不是被抑制的另一面。
    await expect(cell(page, '8:2')).toHaveCSS('border-bottom-style', css!)
    await expect(cell(page, '8:2')).toHaveCSS('border-bottom-width', width!)
    await expect(cell(page, '8:2')).toHaveCSS('border-bottom-color', 'rgb(192, 0, 0)')
    await expect(cell(page, '9:2')).toHaveCSS('border-top-width', '0px')
    await expect(cell(page, '9:3')).toHaveCSS('border-left-width', '0px')
    await expect(cell(page, '10:2')).toHaveCSS('border-top-width', '0px')
    await expect(cell(page, '9:2')).toHaveText(before)
    await expect(cell(page, '9:4')).not.toHaveCSS('border-bottom-color', 'rgb(192, 0, 0)')
    expect((await cell(page, '9:2').boundingBox())!.height).toBe(height)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '8:2')).not.toHaveCSS('border-bottom-color', 'rgb(192, 0, 0)')
    await expect(cell(page, '9:2')).toHaveCSS('border-top-width', '0px')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, '8:2')).toHaveCSS('border-bottom-style', css)
    await expect(cell(page, '8:2')).toHaveCSS('border-bottom-width', width)
    await page.screenshot({ path: info.outputPath(`${style}-border-grid-${viewportWidth}.png`) })
  })
}

test('single side preserves seeded formats, color palette and native settings survive scroll and sheet switches', async ({ page }) => {
  await select(page, 'A2', '1:0')
  await open(page, 'outside', 'double', '#123abc')
  await page.getByRole('button', { name: 'Border color #c00000', exact: true }).click()
  await expect(page.getByLabel('Hex color')).toHaveValue('#c00000')
  await apply(page)
  await open(page, 'bottom', 'dashed', '#123abc')
  await apply(page)
  await expect(cell(page, '1:0')).toHaveCSS('border-top-style', 'double')
  await expect(cell(page, '1:0')).toHaveCSS('border-top-color', 'rgb(192, 0, 0)')
  await expect(cell(page, '1:0')).toHaveCSS('border-bottom-color', 'rgb(18, 58, 188)')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'P900', '899:15')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'A2', '1:0')
  await expect(cell(page, '1:0')).toHaveCSS('border-bottom-style', 'dashed')
})

test('copy of an interior cell retains four native sides, not just its two rendered edges', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await select(page, 'C10:E12', '9:2')
  await open(page, 'all', 'thin', '#123abc'); await apply(page)
  await select(page, 'D11', '10:3'); await copy(page)
  await select(page, 'G15', '14:6'); await paste(page)
  for (const side of ['top', 'right', 'bottom', 'left']) {
    await expect(cell(page, '14:6')).toHaveCSS(`border-${side}-color`, 'rgb(18, 58, 188)')
  }
  // 上／左边可能由邻格绘制；复制后四条可见边仍完整且只绘制一次。
  await select(page, 'A1', '0:0')
  for (const [coord, side] of [
    ['13:6', 'bottom'], ['14:5', 'right'], ['14:6', 'right'], ['14:6', 'bottom'],
  ]) {
    await expect(cell(page, coord)).toHaveCSS(`border-${side}-color`, 'rgb(18, 58, 188)')
    await expect(cell(page, coord)).toHaveCSS(`border-${side}-width`, '1px')
  }
  await expect(cell(page, '14:6')).toHaveCSS('border-top-width', '0px')
  await expect(cell(page, '14:6')).toHaveCSS('border-left-width', '0px')
})

test('native border seed styles reopen correctly and clearing does not clear values', async ({ page }) => {
  for (const [address, coord, side, style, color] of [
    ['B6', '5:1', 'bottom', 'double', '#c00000'], ['B7', '6:1', 'left', 'dashed', '#6fa8dc'],
    ['B8', '7:1', 'top', 'dotted', '#93c47d'],
  ]) {
    await select(page, address!, coord!)
    const before = await cell(page, coord!).textContent()
    await expect(cell(page, coord!)).toHaveCSS(`border-${side}-style`, style!)
    await opener(page).click()
    await expect(page.getByLabel('Line style')).toHaveValue(style!)
    await expect(page.getByLabel('Hex color')).toHaveValue(color!)
    await page.getByLabel('Position', { exact: true }).selectOption('none')
    await apply(page)
    await expect(cell(page, coord!)).toHaveText(before!)
    await expect(cell(page, coord!)).not.toHaveCSS(`border-${side}-style`, style!)
    // 清除 B7 也会清除 B8 的共边；恢复历史后再检查下一条原始种子。
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, coord!)).toHaveCSS(`border-${side}-style`, style!)
  }
})

test('merged cell outside uses the full merged rectangle', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'B8:C9', '7:1')
  await page.getByRole('button', { name: 'Clear contents', exact: true }).click()
  await expect(cell(page, '8:1')).toHaveText('')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  const merged = page.locator('[data-merged-cell][data-cell="7:1"]')
  await expect(merged).toBeVisible()
  await open(page, 'outside', 'double'); await apply(page)
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const segments = merged.locator(`[data-merged-border="${side}"]`)
    await expect(segments).toHaveCount(2)
    for (const segment of await segments.all()) {
      await expect(segment).toHaveCSS(`border-${side}-style`, 'double')
    }
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(merged.locator('[data-merged-border="top"]').first())
    .not.toHaveCSS('border-top-style', 'double')
})

test('frozen cells and the last offscreen cell retain borders after scrolling', async ({ page }) => {
  await select(page, 'C3', '2:2')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'A2', '1:0')
  await open(page, 'outside', 'thick', '#123abc'); await apply(page)
  await select(page, 'P1001', '1000:15')
  await open(page, 'right', 'double', '#c00000'); await apply(page)
  await expect(cell(page, '1000:15')).toHaveCSS('border-right-width', '3px')
  const fixed = page.locator('[data-frozen-pane="corner"] td[data-cell="1:0"]')
  await expect(fixed).toHaveCSS('border-top-width', '0px')
  await expect(fixed).toHaveCSS('border-top-color', 'rgb(18, 58, 188)')
  const fixedAbove = page.locator('[data-frozen-pane="corner"] td[data-cell="0:0"]')
  await expect(fixedAbove).toHaveCSS('border-bottom-width', '3px')
  await expect(fixedAbove).toHaveCSS('border-bottom-color', 'rgb(18, 58, 188)')
  await select(page, 'C4', '3:2')
  await select(page, 'P1001', '1000:15')
  await expect(cell(page, '1000:15')).toHaveCSS('border-right-style', 'double')
})

test('row and column headers apply to the full finite axis, including offscreen cells', async ({ page }) => {
  await page.getByRole('button', { name: 'Select row 12', exact: true }).click()
  await open(page, 'bottom', 'dotted', '#123abc'); await apply(page)
  await select(page, 'P12', '11:15')
  await expect(cell(page, '11:15')).toHaveCSS('border-bottom-style', 'dotted')
  await expect(cell(page, '11:15')).toHaveCSS('border-bottom-color', 'rgb(18, 58, 188)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '11:15')).not.toHaveCSS('border-bottom-style', 'dotted')
  await select(page, 'D2', '1:3')
  await page.getByRole('columnheader', { name: 'Select column D', exact: true }).click()
  await open(page, 'right', 'double'); await apply(page)
  await expect(cell(page, '1:3')).toHaveCSS('border-right-style', 'double')
  await expect(cell(page, '1:3')).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await select(page, 'D1001', '1000:3')
  await expect(cell(page, '1000:3')).toHaveCSS('border-right-style', 'double')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '1000:3')).not.toHaveCSS('border-right-style', 'double')
})

for (const width of [1280, 390]) {
  test(`invalid color, cancel, keyboard focus and layout at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 840 })
    await select(page, 'C10', '9:2')
    await open(page)
    await page.getByLabel('Hex color').fill('not-a-color')
    await page.getByRole('button', { name: 'Apply borders', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('#RRGGBB')
    const dialog = page.getByRole('dialog', { name: 'Borders', exact: true })
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    const rect = await dialog.boundingBox()
    expect(rect!.x).toBeGreaterThanOrEqual(0)
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: info.outputPath(`border-error-${width}.png`) })
    await page.getByLabel('Hex color').fill('#123abc')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`border-ready-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener(page)).toBeFocused()
    await expect(cell(page, '9:2')).toHaveCSS('border-top-width', '0px')
    await opener(page).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(opener(page)).toBeFocused()
    expect(errors).toEqual([])
  })
}
