import { expect, test, type Page } from '@playwright/test'

async function select(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}

async function paint(page: Page, address: string, preset: string, color: string) {
  await select(page, address)
  await page.getByRole('button', { name: 'Border settings', exact: true }).click()
  await page.getByLabel('Position', { exact: true }).selectOption(preset)
  await page.getByLabel('Line style', { exact: true }).selectOption(color === '#123abc' ? 'thin' : 'thick')
  await page.getByLabel('Hex color', { exact: true }).fill(color)
  await page.getByRole('button', { name: 'Apply borders', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Borders', exact: true })).toHaveCount(0)
}

for (const width of [1280, 390]) {
  test(`hidden offscreen top segments meet the frozen row once at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 840 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('unhide-all')
    await select(page, 'C2:E14')
    await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
    await paint(page, 'C2:E14', 'outside', '#c00000')
    await paint(page, 'D1', 'bottom', '#123abc')
    await select(page, 'A2:A10')
    await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-rows')
    await select(page, 'A1')
    await page.getByTestId('sheet-scroll').evaluate((node) => { node.scrollTop = 0; node.scrollLeft = 320 })
    const merged = page.locator('[data-merged-cell][data-cell="1:2"]')
    const top = merged.locator('[data-merged-border="top"][data-border-cell="1:3"]')
    await expect(top).toHaveCSS('border-top-color', 'rgb(18, 58, 188)')
    await expect(top).toHaveCSS('border-top-width', '0px')
    const owner = page.locator('td[data-cell="0:3"]')
    await expect(owner).toHaveCSS('border-bottom-width', '1px')
    await expect(owner).toHaveCSS('border-bottom-color', 'rgb(18, 58, 188)')
    await expect(page.locator('td[data-cell="0:2"]')).toHaveCSS('border-bottom-color', 'rgb(192, 0, 0)')
    await expect.poll(async () => {
      const a = (await merged.boundingBox())!, b = (await owner.boundingBox())!
      return Math.abs(a.y - b.y - b.height)
    }).toBeLessThan(1)
    await page.screenshot({ path: info.outputPath(`hidden-merged-top-${width}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })

  test(`hidden offscreen left segments survive horizontal scroll at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 840 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('unhide-all')
    await select(page, 'H1')
    await page.getByRole('button', { name: 'Row and column size', exact: true }).click()
    await page.getByRole('spinbutton', { name: 'Column width' }).fill('1024')
    await page.getByRole('button', { name: 'Set column width' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await select(page, 'B2:G5')
    await page.getByRole('button', { name: 'Clear contents', exact: true }).click()
    await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
    await paint(page, 'B2:G5', 'outside', '#c00000')
    await paint(page, 'A3', 'right', '#123abc')
    await select(page, 'B1:F1')
    await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-columns')
    await select(page, 'A1')
    // A 列宽 200；滚到 G 的左边界，B:F 的逻辑外沿已在读取窗口以外。
    await page.getByTestId('sheet-scroll').evaluate((node) => { node.scrollLeft = 200; node.scrollTop = 0 })
    const merged = page.locator('[data-merged-cell][data-cell="1:1"]')
    const left = merged.locator('[data-merged-border="left"][data-border-cell="2:1"]')
    await expect(left).toHaveCSS('border-left-color', 'rgb(18, 58, 188)')
    await expect(left).toHaveCSS('border-left-width', '1px')
    await expect(merged.locator('[data-merged-border="left"][data-border-cell="3:1"]'))
      .toHaveCSS('border-left-color', 'rgb(192, 0, 0)')
    const a = (await merged.boundingBox())!, b = (await left.boundingBox())!
    expect(b.x).toBeCloseTo(a.x, 1)
    await page.screenshot({ path: info.outputPath(`hidden-merged-left-${width}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
