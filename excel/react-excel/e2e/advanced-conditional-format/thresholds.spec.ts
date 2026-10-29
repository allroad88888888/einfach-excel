import { expect, test } from '@playwright/test'
import { start, open, save, threshold, cell, button, cleanNeighbor, go, write } from './support'

const cases = [
  { kind: 'min', position: 'Minimum', value: undefined, color: 'rgb(26, 26, 26)', width: 10 },
  { kind: 'max', position: 'Maximum', value: undefined, color: 'rgb(26, 26, 26)', width: 10 },
  { kind: 'number', position: 'Maximum', value: '20', color: 'rgb(128, 128, 128)', width: 50 },
  { kind: 'percent', position: 'Maximum', value: '50', color: 'rgb(51, 51, 51)', width: 20 },
  { kind: 'percentile', position: 'Maximum', value: '50', color: 'rgb(255, 255, 255)', width: 100 },
  { kind: 'formula', position: 'Maximum', value: '=$B$1', color: 'rgb(128, 128, 128)', width: 50 },
]

for (const width of [1280, 390]) for (const scenario of cases) {
  test(`color scale ${scenario.kind} threshold applies and undoes once at ${width}px`, async ({ page }) => {
    await start(page, width)
    const before = await cell(page, '1:0').evaluate(node => getComputedStyle(node).backgroundColor)
    await open(page, 'color-scale')
    await page.getByLabel('Minimum color', { exact: true }).fill('#000000')
    await page.getByLabel('Maximum color', { exact: true }).fill('#ffffff')
    await threshold(page, scenario.position, scenario.kind, scenario.value)
    await save(page)
    await expect(cell(page, '1:0')).toHaveCSS('background-color', scenario.color)
    await expect(cell(page, '1:0')).toHaveText('10'); await cleanNeighbor(page)
    await button(page, 'Undo').click()
    await expect(cell(page, '1:0')).toHaveCSS('background-color', before)
    await button(page, 'Redo').click()
    await expect(cell(page, '1:0')).toHaveCSS('background-color', scenario.color)
  })

  test(`data bar ${scenario.kind} threshold applies and undoes once at ${width}px`, async ({ page }) => {
    await start(page, width); await open(page, 'data-bar')
    await threshold(page, scenario.position, scenario.kind, scenario.value)
    await save(page)
    const fill = cell(page, '1:0').locator('.cell-data-bar-fill')
    await expect(fill).toBeVisible()
    await expect.poll(() => fill.evaluate((node: HTMLElement) => parseFloat(node.style.width))).toBeCloseTo(scenario.width)
    await expect(cell(page, '1:0')).toHaveText('10'); await cleanNeighbor(page)
    await button(page, 'Undo').click(); await expect(fill).toHaveCount(0)
    await button(page, 'Redo').click(); await expect(fill).toBeVisible()
    await expect.poll(() => fill.evaluate((node: HTMLElement) => parseFloat(node.style.width))).toBeCloseTo(scenario.width)
  })
}

for (const width of [1280, 390]) {
  test(`third color accepts an explicit midpoint threshold at ${width}px`, async ({ page }) => {
    await start(page, width); await open(page, 'color-scale')
    await page.getByLabel('Scale colors', { exact: true }).selectOption('3')
    await page.getByLabel('Midpoint color', { exact: true }).fill('#0000ff')
    await threshold(page, 'Midpoint', 'number', '10'); await save(page)
    await expect(cell(page, '1:0')).toHaveCSS('background-color', 'rgb(0, 0, 255)')
    await cleanNeighbor(page); await button(page, 'Undo').click()
    await expect(cell(page, '1:0')).not.toHaveCSS('background-color', 'rgb(0, 0, 255)')
  })

  test(`reset threshold to automatic restores native full-range scaling at ${width}px`, async ({ page }) => {
    await start(page, width); await open(page, 'data-bar')
    await threshold(page, 'Maximum', 'number', '20'); await save(page)
    await open(page); await button(page, 'Edit rule 1').click()
    await threshold(page, 'Maximum', 'auto'); await save(page, true)
    const fill = cell(page, '1:0').locator('.cell-data-bar-fill')
    await expect.poll(() => fill.evaluate((node: HTMLElement) => parseFloat(node.style.width))).toBeCloseTo(10)
    await cleanNeighbor(page); await button(page, 'Undo').click()
    // 撤销是一次异步 Rust 往返；只读一次会读到发布前的旧宽度。
    await expect.poll(() => fill.evaluate((node: HTMLElement) => parseFloat(node.style.width)))
      .toBeCloseTo(50)
  })

  test(`formula threshold tracks a changed reference without changing its rule at ${width}px`, async ({ page }) => {
    await start(page, width); await open(page, 'color-scale')
    await page.getByLabel('Minimum color', { exact: true }).fill('#000000')
    await page.getByLabel('Maximum color', { exact: true }).fill('#ffffff')
    await threshold(page, 'Maximum', 'formula', '=$B$1'); await save(page)
    await write(page, 'B1', '40'); await go(page, 'A2')
    await expect(cell(page, '1:0')).toHaveCSS('background-color', 'rgb(64, 64, 64)')
    await cleanNeighbor(page); await button(page, 'Undo').click()
    await expect(cell(page, '1:0')).toHaveCSS('background-color', 'rgb(128, 128, 128)')
  })
}
