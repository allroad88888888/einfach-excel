import { expect, test, type Page } from '@playwright/test'

async function point(page: Page, col: number, row: number) {
  const box = (await page.locator('canvas').boundingBox())!
  return { x: box.x + col * 60 + 30, y: box.y + row * 34 + 17 }
}
async function move(page: Page, col: number, row: number) {
  const p = await point(page, col, row)
  await page.mouse.move(p.x, p.y)
}
async function color(page: Page, col: number, row: number) {
  return page.locator('canvas').evaluate((el, p) => {
    const canvas = el as HTMLCanvasElement
    const ratio = canvas.width / parseFloat(canvas.style.width)
    return Array.from(canvas.getContext('2d')!.getImageData(
      (p.col * 60 + 8) * ratio, (p.row * 34 + 8) * ratio, 1, 1,
    ).data)
  }, { col, row })
}
const range = (page: Page) => page.locator('[data-value="selection"]')

test('hover repaints cells and drag paints a rectangle, with Shift extension and Escape', async ({ page }) => {
  await page.goto('/#/cache')
  await expect(page.locator('[data-value="painted"]')).toHaveText('500')
  await move(page, 0, 0)
  await expect(page.locator('[data-value="hover"]')).toHaveText('A1')
  await expect.poll(() => color(page, 0, 0)).toEqual([227, 242, 235, 255])
  await expect(page.locator('[data-value="painted"]')).toHaveText('1')
  await move(page, 1, 0)
  await expect(page.locator('[data-value="hover"]')).toHaveText('B1')
  await expect.poll(() => color(page, 0, 0)).toEqual([255, 255, 255, 255])
  await expect(page.locator('[data-value="painted"]')).toHaveText('2')
  await move(page, 1, 1)
  await page.mouse.down()
  await move(page, 3, 3)
  await page.mouse.up()
  await expect(range(page)).toHaveText('B2:D4')
  await expect(page.locator('[data-value="selected-count"]')).toHaveText('9')
  await expect.poll(() => color(page, 2, 2)).toEqual([220, 232, 255, 255])
  await expect.poll(() => color(page, 4, 2)).toEqual([255, 255, 255, 255])
  await page.screenshot({ path: 'test-results/canvas-grid-selection.png', fullPage: true })
  await page.keyboard.down('Shift')
  const target = await point(page, 4, 4)
  await page.mouse.click(target.x, target.y)
  await page.keyboard.up('Shift')
  await expect(range(page)).toHaveText('B2:E5')
  await expect(page.locator('[data-value="selected-count"]')).toHaveText('16')
  await page.keyboard.press('Escape')
  await expect(range(page)).toHaveText('—')
  await expect.poll(() => color(page, 2, 2)).toEqual([255, 255, 255, 255])
  await expect(page.locator('[data-value="subscriptions"]')).toHaveText('500')
})

test('reverse drag, scrolling and release outside the canvas preserve correct selection', async ({ page }) => {
  await page.goto('/#/cache')
  await move(page, 3, 3)
  await page.mouse.down()
  await move(page, 1, 1)
  await page.mouse.up()
  await expect(range(page)).toHaveText('B2:D4')
  await page.locator('.grid-viewport').evaluate(el => { el.scrollTop = 68; el.scrollLeft = 120 })
  await move(page, 4, 4)
  await expect(page.locator('[data-value="hover"]')).toHaveText('E5')
  await page.mouse.down()
  await page.mouse.move(5, 5)
  await page.mouse.up()
  const selection = await range(page).textContent()
  await move(page, 6, 5)
  await expect(range(page)).toHaveText(selection!)
  expect(await page.locator('canvas').evaluate(el => el.hasPointerCapture(1))).toBe(false)
})

test('hiding or destroying a region during a drag releases capture and resets interaction', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#/cache')
  for (const action of ['visibility', 'destroy']) {
    await move(page, 1, 1)
    await page.mouse.down()
    await move(page, 3, 3)
    expect(await page.locator('canvas').evaluate(el => el.hasPointerCapture(1))).toBe(true)
    await page.locator(`[data-action="${action}"]`).evaluate((el: HTMLButtonElement) => el.click())
    await expect(range(page)).toHaveText('—')
    await expect(page.locator('[data-value="subscriptions"]')).toHaveText('0')
    expect(await page.locator('canvas').evaluate(el => el.hasPointerCapture(1))).toBe(false)
    await page.mouse.up()
    await page.locator(`[data-action="${action === 'destroy' ? 'recreate' : 'visibility'}"]`).click()
    await expect(page.locator('[data-value="subscriptions"]')).toHaveText('500')
  }
  await move(page, 2, 2)
  await page.mouse.down()
  await move(page, 3, 3)
  await page.mouse.up()
  await expect(range(page)).toHaveText('C3:D4')
  expect(errors).toEqual([])
})
