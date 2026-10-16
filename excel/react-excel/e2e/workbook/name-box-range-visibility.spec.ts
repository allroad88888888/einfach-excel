import { expect, test, type Page } from '@playwright/test'

async function select(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  await expect(name).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}

for (const width of [1280, 390]) {
  test(`name box reveals the fill corner on both axes at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const scroll = page.getByTestId('sheet-scroll')
    const offsets = () => scroll.evaluate((node) => ({ top: node.scrollTop, left: node.scrollLeft }))
    const handle = page.getByRole('button', { name: 'Drag to fill', exact: true })
    await select(page, 'A40:A41')
    await expect(handle).toBeInViewport()
    await expect(handle).toBeVisible()
    const vertical = await offsets()
    await handle.hover()
    await page.mouse.down()
    // Hold at the viewport edge across frames without starting a drag.
    await page.evaluate(async () => {
      for (let frame = 0; frame < 10; frame++)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    expect(await offsets()).toEqual(vertical)
    await page.mouse.up()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A40:A41')
    await select(page, 'A40:A41')
    expect(await offsets()).toEqual(vertical)
    await select(page, 'A41')
    expect(await offsets()).toEqual(vertical)
    // G is hidden in the native seed; its zero width must not consume viewport space.
    await select(page, 'G40:H41')
    await expect(handle).toBeVisible()
    await expect(handle).toBeInViewport()
    const horizontal = await offsets()
    for (const coord of ['39:7', '40:7']) {
      const box = (await page.locator(`td[data-cell="${coord}"]`).boundingBox())!
      const viewport = (await scroll.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(viewport.x + 46 - 1)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.x + viewport.width + 1)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1)
    }
    await select(page, 'G40:H41')
    expect(await offsets()).toEqual(horizontal)
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath(`range-corner-${width}.png`) })

    if (width === 390) {
      // Two 120px visible columns cannot fit the 227px body: keep the first one visible.
      await select(page, 'F40:H41')
      await expect(page.locator('td[data-cell="39:5"]')).toBeInViewport()
      await expect(handle).toBeHidden()
    }
    // An oversized range must not jump to its far end and hide the active cell.
    await select(page, 'H2:H100')
    await expect(page.locator('td[data-cell="1:7"]')).toBeInViewport()
    await expect(handle).toBeHidden()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}
