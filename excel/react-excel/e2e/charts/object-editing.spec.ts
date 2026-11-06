import { expect, test, type Page } from '@playwright/test'
import { box, button, frame, frames, openWorkbook } from './chart-support'

test.use({ viewport: { width: 1440, height: 1500 } })

const revenue = (page: Page) => frame(page, 'chart-revenue')
// 散点图在右下方，右下角的缩放手柄不被其他图表盖住。
const spend = (page: Page) => frame(page, 'chart-spend')
const ids = (page: Page) => frames(page).evaluateAll((nodes) =>
  nodes.map((node) => node.getAttribute('data-drawing-id')))

test.beforeEach(async ({ page }) => {
  await openWorkbook(page, '?demo=charts')
  await expect(frames(page)).toHaveCount(5)
})

test('dragging a chart moves it and dragging the corner handle resizes it, both undoable', async ({ page }) => {
  const before = await box(spend(page))
  const startX = before.x + before.width / 2
  const startY = before.y + before.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX - 30, startY - 15, { steps: 5 })
  await page.mouse.move(startX - 60, startY - 30, { steps: 5 })
  await page.mouse.up()
  await expect(spend(page)).toHaveAttribute('data-selected', 'true')
  const near = (read: () => Promise<number>, expected: number) =>
    expect.poll(async () => Math.abs((await read()) - expected)).toBeLessThan(3)
  const rect = () => box(spend(page))
  await near(async () => (await rect()).x, before.x - 60)
  await near(async () => (await rect()).y, before.y - 30)
  const moved = await rect()
  expect(moved.width).toBeCloseTo(before.width, 0)

  const corner = await box(spend(page).locator('[data-handle="se"]'))
  const cx = corner.x + corner.width / 2
  const cy = corner.y + corner.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  // 手柄只有 8px：先在手柄内小幅移动越过阈值以捕获指针，之后指针可以离开手柄。
  await page.mouse.move(cx + 3, cy)
  await page.mouse.move(cx + 40, cy + 20, { steps: 5 })
  await page.mouse.move(cx + 80, cy + 40, { steps: 5 })
  await page.mouse.up()
  await near(async () => (await rect()).width, moved.width + 80)
  await near(async () => (await rect()).height, moved.height + 40)
  expect((await rect()).x).toBeCloseTo(moved.x, 0)

  await button(page, 'Undo').click()
  await near(async () => (await rect()).width, moved.width)
  await near(async () => (await rect()).height, moved.height)
  await button(page, 'Undo').click()
  await near(async () => (await rect()).x, before.x)
  await near(async () => (await rect()).y, before.y)
  await button(page, 'Redo').click()
  await near(async () => (await rect()).x, moved.x)
})

test('Delete removes the selected chart and undo brings it back', async ({ page }) => {
  await revenue(page).click({ position: { x: 20, y: 20 } })
  await expect(revenue(page)).toHaveAttribute('data-selected', 'true')
  await page.keyboard.press('Delete')
  await expect(revenue(page)).toHaveCount(0)
  await expect(frames(page)).toHaveCount(4)
  await button(page, 'Undo').click()
  await expect(revenue(page)).toBeVisible()
  await expect(frames(page)).toHaveCount(5)
})

test('the chart context menu brings a chart to the front and sends it to the back', async ({ page }) => {
  const original = await ids(page)
  expect(original[0]).toBe('chart-revenue')
  await revenue(page).click({ button: 'right', position: { x: 20, y: 20 } })
  const menu = page.getByRole('menu', { name: 'Object actions' })
  await expect(menu.getByRole('menuitem')).toHaveText(
    ['Cut', 'Copy', 'Paste', 'Bring to front', 'Send to back', 'Delete'])
  await menu.getByRole('menuitem', { name: 'Bring to front' }).click()
  await expect(menu).toBeHidden()
  await expect.poll(() => ids(page).then((list) => list.at(-1))).toBe('chart-revenue')

  await revenue(page).click({ button: 'right', position: { x: 20, y: 20 } })
  await menu.getByRole('menuitem', { name: 'Send to back' }).click()
  await expect.poll(() => ids(page)).toEqual(original)
  await button(page, 'Undo').click()
  await expect.poll(() => ids(page).then((list) => list.at(-1))).toBe('chart-revenue')
})

test('copying and pasting a chart with the keyboard adds a duplicate that undo removes', async ({ page }) => {
  await revenue(page).click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('ControlOrMeta+v')
  await expect(frames(page)).toHaveCount(6)
  const seeded = ['chart-revenue', 'chart-trend', 'chart-products', 'chart-spend', 'chart-quarters']
  const pasted = (await ids(page)).filter((id) => !seeded.includes(id ?? ''))
  expect(pasted).toHaveLength(1)
  await expect(frame(page, pasted[0]!).locator('canvas')).toBeVisible()
  await button(page, 'Undo').click()
  await expect(frames(page)).toHaveCount(5)
  await expect(revenue(page)).toBeVisible()
})
