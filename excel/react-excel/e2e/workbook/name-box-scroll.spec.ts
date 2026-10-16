import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

for (const width of [1280, 390]) {
  test(`multiline target keeps its formula bar and viewport stable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await select(page, 'A2', '1:0')
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await expect(page.locator('td[data-cell="0:0"]')).toHaveText('First order total')
    await select(page, 'F90', '89:5')
    const formula = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await expect(formula).toHaveValue('第一行\nSecond line\n第三行')
    const samples = await page.evaluate(async () => {
      const frames = []
      for (let i = 0; i < 16; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const scroll = document.querySelector<HTMLElement>('.sheet-scroll')!
        const input = document.querySelector<HTMLTextAreaElement>('#formula-input')!
        const row = document.querySelector('[aria-label="Select row 90"]')
        frames.push({ height: scroll.clientHeight, value: input.value, rows: input.rows,
          hasRow: row !== null })
      }
      return frames
    })
    expect(new Set(samples.map((sample) => sample.height)).size).toBe(1)
    for (const sample of samples) {
      expect(sample).toMatchObject({ rows: 3, value: '第一行\nSecond line\n第三行', hasRow: true })
    }
    await page.getByRole('button', { name: 'Select row 90', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A90:H90')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })

  test(`name box only scrolls when its target is outside the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('[data-cell="0:0"]')).toBeVisible()
    const scroll = page.getByTestId('sheet-scroll')
    const offsets = () => scroll.evaluate((node) => (
      { top: node.scrollTop, left: node.scrollLeft }
    ))
    await select(page, 'B8', '7:1')
    expect(await offsets()).toEqual({ top: 0, left: 0 })
    await select(page, 'B100', '99:1')
    const below = await offsets()
    expect(below.top).toBeGreaterThan(0)
    const rect = await page.locator('[data-cell="99:1"]').boundingBox()
    const viewport = (await scroll.boundingBox())!
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1)
    expect(rect!.y).toBeGreaterThan(viewport.y + 28)
    await select(page, 'B99', '98:1')
    expect(await offsets()).toEqual(below)
    await select(page, 'B2', '1:1')
    expect((await offsets()).top).toBeLessThan(below.top)
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
  })
}
