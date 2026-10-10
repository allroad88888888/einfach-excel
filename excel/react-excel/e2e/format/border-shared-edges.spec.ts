import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function paint(page: Page, address: string, coord: string,
  preset: string, style = 'thin', color = '#123abc') {
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
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('later thin line replaces an older thick shared edge in either direction', async ({ page }) => {
  await paint(page, 'C10', '9:2', 'right', 'thick', '#c00000')
  await paint(page, 'D10', '9:3', 'left')
  await select(page, 'A1', '0:0')
  await expect(cell(page, '9:2')).toHaveCSS('border-right-color', 'rgb(18, 58, 188)')
  await expect(cell(page, '9:2')).toHaveCSS('border-right-width', '1px')
  await expect(cell(page, '9:3')).toHaveCSS('border-left-width', '0px')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A1', '0:0')
  await expect(cell(page, '9:2')).toHaveCSS('border-right-color', 'rgb(192, 0, 0)')
  await expect(cell(page, '9:2')).toHaveCSS('border-right-width', '3px')
  await paint(page, 'D10', '9:3', 'left', 'thick', '#c00000')
  await paint(page, 'C10', '9:2', 'right')
  await select(page, 'A1', '0:0')
  await expect(cell(page, '9:2')).toHaveCSS('border-right-width', '1px')
  await expect(cell(page, '9:2')).toHaveCSS('border-right-color', 'rgb(18, 58, 188)')
})

test('clear middle cell removes all four shared lines and one undo restores neighbours', async ({ page }) => {
  await paint(page, 'C10:E12', '9:2', 'all', 'thick', '#c00000')
  await paint(page, 'D11', '10:3', 'none')
  await select(page, 'A1', '0:0')
  const faces = [['10:2', 'right'], ['9:3', 'bottom'],
    ['10:3', 'right'], ['10:3', 'bottom']] as const
  for (const [coord, side] of faces) {
    await expect(cell(page, coord)).not.toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
  }
  await expect(cell(page, '11:4')).toHaveCSS('border-bottom-color', 'rgb(192, 0, 0)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A1', '0:0')
  for (const [coord, side] of faces) {
    await expect(cell(page, coord)).toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
    await expect(cell(page, coord)).toHaveCSS(`border-${side}-width`, '3px')
  }
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await select(page, 'A1', '0:0')
  for (const [coord, side] of faces) {
    await expect(cell(page, coord)).not.toHaveCSS(`border-${side}-color`, 'rgb(192, 0, 0)')
  }
})

test('quick Borders uses the same native shared edge transaction', async ({ page }) => {
  await paint(page, 'C10', '9:2', 'right', 'thick', '#c00000')
  await select(page, 'D10', '9:3')
  const quick = page.getByRole('button', { name: 'Borders', exact: true })
  await quick.click()
  await expect(quick).toHaveAttribute('aria-pressed', 'true')
  await select(page, 'A1', '0:0')
  await expect(cell(page, '9:2')).toHaveCSS('border-right-color', 'rgb(127, 127, 127)')
  await expect(cell(page, '9:2')).toHaveCSS('border-right-width', '1px')
  await select(page, 'D10', '9:3')
  await quick.click()
  await expect(quick).toHaveAttribute('aria-pressed', 'false')
  await select(page, 'A1', '0:0')
  await expect(cell(page, '9:2')).not.toHaveCSS('border-right-color', 'rgb(127, 127, 127)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A1', '0:0')
  await expect(cell(page, '9:2')).toHaveCSS('border-right-color', 'rgb(127, 127, 127)')
})

for (const width of [1280, 390]) {
  test(`frozen seam paints once without shadow at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 840 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await paint(page, 'A2:B2', '1:0', 'bottom', 'thin')
    await paint(page, 'B1:B3', '0:1', 'right', 'thin')
    await select(page, 'C3', '2:2')
    await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
    await select(page, 'A1', '0:0')
    // 选中冻结格不会复位滚动；显式回到原点才能验证两侧相邻的接缝。
    await page.getByTestId('sheet-scroll').evaluate((node) => {
      node.scrollTop = 0
      node.scrollLeft = 0
    })
    const corner = page.locator('[data-frozen-pane="corner"]')
    await expect(corner.locator('td[data-cell="1:0"]')).toHaveCSS('border-bottom-width', '1px')
    await expect(corner.locator('td[data-cell="1:0"]'))
      .toHaveCSS('border-bottom-color', 'rgb(18, 58, 188)')
    await expect(corner.locator('td[data-cell="0:1"]'))
      .toHaveCSS('border-right-color', 'rgb(18, 58, 188)')
    expect(await corner.evaluate((node) => getComputedStyle(node, '::after').boxShadow)).toBe('none')
    await expect(page.locator('[data-frozen-pane="left"] td[data-cell="2:0"]'))
      .toHaveCSS('border-top-width', '0px')
    await expect(page.locator('[data-frozen-pane="top"] td[data-cell="0:2"]'))
      .toHaveCSS('border-left-width', '0px')
    await page.screenshot({ path: info.outputPath(`shared-border-${width}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await select(page, 'P900', '899:15')
    await expect(corner.locator('td[data-cell="1:0"]'))
      .toHaveCSS('border-bottom-color', 'rgb(18, 58, 188)')
    await select(page, 'A1', '0:0')
    await expect(corner.locator('td[data-cell="1:0"]')).toHaveCSS('border-bottom-width', '1px')
    expect(errors).toEqual([])
  })
}
