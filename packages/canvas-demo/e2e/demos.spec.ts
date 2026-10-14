import { expect, test, type Page } from '@playwright/test'

async function recordText(page: Page) {
  await page.addInitScript(() => {
    const text: string[] = []
    Object.defineProperty(window, 'drawnTexts', { value: text })
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y, maxWidth) {
      text.push(value)
      if (maxWidth === undefined) original.call(this, value, x, y)
      else original.call(this, value, x, y, maxWidth)
    }
  })
}

async function alpha(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((element, point) => {
    const canvas = element as HTMLCanvasElement
    const ratio = canvas.width / parseFloat(canvas.style.width)
    return canvas.getContext('2d')!.getImageData(point.x * ratio, point.y * ratio, 1, 1).data[3]
  }, { x, y })
}

test('draws Canvas text and merges 100 writes without recreating cells', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await recordText(page)
  await page.goto('/#/bindings')
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.locator('[data-value="count-paints"]')).toHaveText('1')
  await page.getByRole('button', { name: '加一 +' }).click()
  await expect(page.locator('[data-value="count-paints"]')).toHaveText('2')
  await page.getByRole('button', { name: '连续写入 100 次' }).click()
  await expect(page.locator('[data-value="count-paints"]')).toHaveText('3')
  await expect(page.locator('[data-value="double-paints"]')).toHaveText('3')
  await expect(page.locator('[data-value="text-paints"]')).toHaveText('1')
  await expect(page.locator('[data-value="painted"]')).toHaveText('2')
  await expect(page.locator('[data-value="mounts"]')).toHaveText('3')
  expect(await page.evaluate(() => Reflect.get(window, 'drawnTexts'))).toEqual(
    expect.arrayContaining(['101', '202', 'Hello, canvas']),
  )
  await page.getByRole('textbox', { name: '演示文字' }).fill('Canvas 直接绘制')
  await expect(page.locator('[data-value="text-paints"]')).toHaveText('2')
  await expect(page.locator('[data-value="count-paints"]')).toHaveText('3')
  expect(await page.evaluate(() => Reflect.get(window, 'drawnTexts'))).toContain('Canvas 直接绘制')
  await page.screenshot({ path: 'test-results/canvas-bindings.png', fullPage: true })
  expect(errors).toEqual([])
})

test('removes real painted pixels and subscriptions, then remounts the latest atom value', async ({ page }) => {
  await recordText(page)
  await page.goto('/#/lifecycle')
  await expect.poll(() => alpha(page, 160, 50)).toBe(255)
  await expect(page.locator('[data-value="subscriptions"]')).toHaveText('1')
  await page.getByRole('button', { name: '更新源 atom +1' }).click()
  await expect(page.locator('[data-value="paints"]')).toHaveText('2')
  await page.getByRole('button', { name: '销毁 cell', exact: true }).click()
  await expect.poll(() => alpha(page, 160, 50)).toBe(0)
  await expect(page.locator('[data-value="subscriptions"]')).toHaveText('0')
  await page.getByRole('button', { name: '更新源 atom +1' }).click()
  await expect(page.locator('[data-value="source"]')).toHaveText('2')
  await expect(page.locator('[data-value="paints"]')).toHaveText('2')
  await page.getByRole('button', { name: '重新挂载 cell' }).click()
  await expect(page.locator('[data-value="paints"]')).toHaveText('3')
  await expect.poll(() => alpha(page, 160, 50)).toBe(255)
  expect(await page.evaluate(() => Reflect.get(window, 'drawnTexts'))).toContain('2')
  await page.screenshot({ path: 'test-results/canvas-lifecycle.png', fullPage: true })
  await page.getByRole('button', { name: '自动更新', exact: true }).click()
  const oldSource = await page.locator('[data-value="source"]').elementHandle()
  await page.getByRole('link', { name: 'Canvas 重绘' }).click()
  const snapshot = await oldSource?.textContent()
  await page.waitForTimeout(750)
  expect(await oldSource?.textContent()).toBe(snapshot)
})

test('paints only changed grid cells and reuses cached state after hiding', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#/cache')
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByRole('cell')).toHaveCount(0)
  await expect(page.locator('[data-value="painted"]')).toHaveText('500')
  await expect(page.locator('[data-value="subscriptions"]')).toHaveText('500')
  await page.getByRole('button', { name: '更新 1 格', exact: true }).click()
  await expect(page.locator('[data-value="painted"]')).toHaveText('1')
  await page.getByRole('button', { name: '随机更新 100 格' }).click()
  await expect(page.locator('[data-value="painted"]')).toHaveText('100')
  const bitmap = await page.locator('canvas').evaluate(el => (el as HTMLCanvasElement).toDataURL())
  await page.getByRole('button', { name: '隐藏 cell' }).click()
  await expect(page.locator('[data-value="subscriptions"]')).toHaveText('0')
  await expect.poll(() => alpha(page, 10, 10)).toBe(0)
  await page.getByRole('button', { name: '显示 cell' }).click()
  await expect(page.locator('[data-value="painted"]')).toHaveText('500')
  expect(await page.locator('canvas').evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(bitmap)
  await expect(page.locator('[data-value="atoms"]')).toHaveText('500')
  await expect(page.locator('[data-value="cells"]')).toHaveText('1000')
  await expect(page.locator('[data-value="cache-message"]')).toContainText('身份检查通过')
  await page.getByRole('combobox', { name: '网格规模' }).selectOption('50')
  await expect(page.locator('[data-value="painted"]')).toHaveText('1000')
  await expect(page.locator('[data-value="subscriptions"]')).toHaveText('1000')
  await page.screenshot({ path: 'test-results/canvas-cache.png', fullPage: true })
  await page.getByRole('button', { name: '销毁区域' }).click()
  await expect.poll(() => alpha(page, 10, 10)).toBe(0)
  await expect(page.locator('[data-value="subscriptions"]')).toHaveText('0')
  await expect(page.locator('[data-value="cache-message"]')).toContainText('失效检查通过')
  await page.getByRole('button', { name: '重新创建区域' }).click()
  await expect(page.locator('[data-value="region"]')).toHaveText('区域 #2')
  await expect(page.locator('[data-value="painted"]')).toHaveText('1000')
  expect(errors).toEqual([])
})

test('Canvas pages stay within phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of ['bindings', 'lifecycle', 'cache']) {
    await page.goto(`/#/${route}`)
    await expect(page.locator('canvas')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.screenshot({ path: `test-results/mobile-canvas-${route}.png`, fullPage: true })
  }
})
