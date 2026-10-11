import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const merged = (page: Page) => page.locator('[data-merged-cell][data-cell="7:1"]')
const segment = (page: Page, side: string, coord: string) =>
  merged(page).locator(`[data-merged-border="${side}"][data-border-cell="${coord}"]`)
async function paint(page: Page, address: string, coord: string, preset: string,
  color = '#123abc', style = 'thin') {
  await select(page, address, coord)
  await page.getByRole('button', { name: 'Border settings', exact: true }).click()
  await page.getByLabel('Position', { exact: true }).selectOption(preset)
  if (preset !== 'none') {
    await page.getByLabel('Line style', { exact: true }).selectOption(style)
    await page.getByLabel('Hex color', { exact: true }).fill(color)
  }
  await page.getByRole('button', { name: 'Apply borders', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Borders', exact: true })).toHaveCount(0)
}
async function merge(page: Page) {
  await select(page, 'B8:D10', '7:1')
  // 本用例需要空合并区域；Summary 分组示例现在在 B9 有原生数值。
  await page.getByRole('button', { name: 'Clear contents', exact: true }).click()
  await expect(page.locator('td[data-cell="8:1"]')).toHaveText('')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await expect(merged(page)).toBeVisible()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('unhide-all')
  await expect(page.locator('td[data-cell="9:0"]')).toHaveText('Hidden row example')
})

test('native merged seed shows one thin blue bottom segment between thick red segments', async ({ page }) => {
  await select(page, 'A15:D15', '14:0')
  const seed = page.locator('[data-merged-cell][data-cell="14:0"]')
  await expect(seed).toHaveText('Merged heading')
  for (const col of [0, 1, 2, 3]) {
    const edge = seed.locator(`[data-merged-border="bottom"][data-border-cell="14:${col}"]`)
    await expect(edge).toHaveCSS('border-bottom-color', col === 2 ? 'rgb(18, 58, 188)' : 'rgb(192, 0, 0)')
    await expect(edge).toHaveCSS('border-bottom-width', col === 2 ? '1px' : '3px')
  }
})

test('changing the first bottom segment of a single-row merge keeps other seeded segments', async ({ page }) => {
  await paint(page, 'A16', '15:0', 'top')
  await select(page, 'A1', '0:0')
  const seed = page.locator('[data-merged-cell][data-cell="14:0"]')
  const bottom = (col: number) => seed.locator(`[data-merged-border="bottom"][data-border-cell="14:${col}"]`)
  for (const col of [0, 1, 2, 3]) {
    await expect(bottom(col)).toHaveCSS('border-bottom-color', col % 2 === 0 ? 'rgb(18, 58, 188)' : 'rgb(192, 0, 0)')
    await expect(bottom(col)).toHaveCSS('border-bottom-width', col % 2 === 0 ? '1px' : '3px')
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(bottom(0)).toHaveCSS('border-bottom-color', 'rgb(192, 0, 0)')
  await expect(bottom(2)).toHaveCSS('border-bottom-color', 'rgb(18, 58, 188)')
})

for (const [side, address, coord, preset, target, others, owner, ownerSide] of [
  ['right', 'E9', '8:4', 'left', '8:3', ['7:3', '9:3'], '8:3', 'right'],
  ['left', 'A9', '8:0', 'right', '8:1', ['7:1', '9:1'], '8:0', 'right'],
  ['top', 'C7', '6:2', 'bottom', '7:2', ['7:1', '7:3'], '6:2', 'bottom'],
  ['bottom', 'C11', '10:2', 'top', '9:2', ['9:1', '9:3'], '9:2', 'bottom'],
] as const) {
  test(`editing one ${side} segment preserves the other two and undo restores it`, async ({ page }) => {
    await merge(page)
    await paint(page, 'B8:D10', '7:1', 'outside', '#c00000', 'thick')
    await paint(page, address, coord, preset)
    await select(page, 'A1', '0:0')
    await expect(segment(page, side, target)).toHaveCSS(`border-${side}-color`, 'rgb(18, 58, 188)')
    for (const other of others) {
      await expect(segment(page, side, other)).toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
    }
    const visibleEdge = side === 'top' || side === 'left'
      ? page.locator(`td[data-cell="${owner}"]`) : segment(page, side, target)
    await expect(visibleEdge).toHaveCSS(`border-${ownerSide}-width`, '1px')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await select(page, 'A1', '0:0')
    await expect(segment(page, side, target)).toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
    await expect(visibleEdge).toHaveCSS(`border-${ownerSide}-width`, '3px')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await select(page, 'A1', '0:0')
    await expect(segment(page, side, target)).toHaveCSS(`border-${side}-color`, 'rgb(18, 58, 188)')
  })
}

test('clear a middle segment, scroll away and undo without clearing the whole merged border', async ({ page }) => {
  await merge(page)
  await paint(page, 'B8:D10', '7:1', 'outside', '#c00000', 'thick')
  await paint(page, 'E9', '8:4', 'none')
  await select(page, 'A50', '49:0')
  await select(page, 'A2', '1:0')
  await expect(segment(page, 'right', '8:3')).not.toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
  await expect(segment(page, 'right', '7:3')).toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
  await expect(segment(page, 'right', '9:3')).toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A1', '0:0')
  await expect(segment(page, 'right', '8:3')).toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
})

test('hiding the last merged row keeps its bottom edge at the collapsed boundary', async ({ page }) => {
  await merge(page)
  await paint(page, 'B8:D10', '7:1', 'outside', '#c00000', 'thick')
  await select(page, 'A10', '9:0')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-rows')
  await select(page, 'A2', '1:0')
  const bottom = segment(page, 'bottom', '9:2')
  await expect(bottom).toHaveCSS('border-bottom-color', 'rgb(192, 0, 0)')
  await expect(bottom).toHaveCSS('border-bottom-width', '3px')
  const mergeRect = (await merged(page).boundingBox())!
  const lineRect = (await bottom.boundingBox())!
  expect(lineRect.y + lineRect.height).toBeCloseTo(mergeRect.y + mergeRect.height, 1)
  await expect(segment(page, 'right', '9:3')).toHaveCount(0)
})

for (const width of [1280, 390]) {
  test(`first segment does not color an empty merge's remaining top edge at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 840 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await merge(page)
    await paint(page, 'B7', '6:1', 'bottom')
    await select(page, 'B8:D10', '7:1')
    await expect(segment(page, 'top', '7:1')).toHaveCSS('border-top-color', 'rgb(18, 58, 188)')
    if (width === 390) {
      await page.getByTestId('sheet-scroll').evaluate((node) => { node.scrollLeft = 300 })
    }
    for (const coord of ['7:2', '7:3']) {
      await expect(segment(page, 'top', coord)).not.toHaveCSS('border-top-color', 'rgb(18, 58, 188)')
    }
    await page.screenshot({ path: info.outputPath(`merged-segment-${width}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
