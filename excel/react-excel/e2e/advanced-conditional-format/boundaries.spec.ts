import { expect, test } from '@playwright/test'
import { start, open, save, icon, cell, button, cleanNeighbor, addIcons, go } from './support'

for (const width of [1280, 390]) {
  test(`hidden numeric members remain in advanced visual statistics at ${width}px`, async ({ page }) => {
    await start(page, width); await open(page, 'data-bar'); await save(page)
    await go(page, 'A3')
    await page.getByRole('combobox', { name: 'Row and column visibility', exact: true }).selectOption('hide-rows')
    await expect(cell(page, '2:0')).toHaveCount(0)
    const fill = cell(page, '1:0').locator('.cell-data-bar-fill')
    expect(await fill.evaluate((node: HTMLElement) => parseFloat(node.style.width))).toBeCloseTo(10)
    await cleanNeighbor(page); await button(page, 'Undo').click()
    await expect(cell(page, '2:0')).toHaveText('100')
    expect(await fill.evaluate((node: HTMLElement) => parseFloat(node.style.width))).toBeCloseTo(10)
  })

  test(`merged anchor renders the native icon once at ${width}px`, async ({ page }) => {
    await start(page, width); await addIcons(page); await go(page, 'A3:B3')
    await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
    const merged = page.locator('[data-merged-cell="true"][data-cell="2:0"]')
    await expect(merged.locator('[data-conditional-icon]')).toHaveCount(1)
    await expect(icon(page, '2:0')).toHaveCount(0)
    await button(page, 'Undo').click(); await expect(icon(page, '2:0')).toHaveCount(1)
    await cleanNeighbor(page)
  })

  test(`frozen pane renders the native icon once while scrolling at ${width}px`, async ({ page }) => {
    await start(page, width); await addIcons(page)
    await page.getByRole('combobox', { name: 'Freeze panes', exact: true }).selectOption('first-row')
    await go(page, 'A50')
    const fixed = page.locator('[data-frozen-pane="top"] td[data-cell="0:0"]')
    await expect(fixed.locator('[data-conditional-icon]')).toHaveCount(1)
    await expect(fixed.locator('[data-conditional-icon]')).toHaveAttribute('data-icon-index', '0')
    await button(page, 'Undo').click(); await go(page, 'A2'); await cleanNeighbor(page)
  })

  test(`format painter copies base formatting without copying conditional icons at ${width}px`, async ({ page }) => {
    await start(page, width); await addIcons(page); await go(page, 'A2')
    const brush = button(page, 'Format painter'); await brush.click()
    await expect(brush).toHaveAttribute('data-painter-mode', 'armed')
    await cell(page, '1:1').click()
    await expect(brush).toHaveAttribute('data-painter-mode', 'idle')
    await expect(icon(page, '1:0')).toHaveCount(1); await expect(icon(page, '1:1')).toHaveCount(0)
    await expect(cell(page, '1:1')).toHaveText(''); await cleanNeighbor(page)
  })
}
