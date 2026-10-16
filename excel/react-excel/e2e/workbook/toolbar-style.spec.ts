import { expect, test } from '@playwright/test'

for (const width of [1280, 390]) {
  test(`toolbar selects share control dimensions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('[data-cell="0:0"]')).toBeVisible()
    const controls = await page.locator('.ribbon-tools select').evaluateAll((selects) =>
      selects.map((select) => {
        const style = getComputedStyle(select)
        return {
          label: select.getAttribute('aria-label'),
          height: select.getBoundingClientRect().height,
          fontSize: style.fontSize,
          radius: style.borderRadius,
        }
      }),
    )
    expect(controls.length).toBeGreaterThan(10)
    for (const control of controls) {
      expect(control.height, control.label!).toBe(28)
      expect(control.fontSize, control.label!).toBe('12px')
      expect(control.radius, control.label!).toBe('6px')
    }
    const quickFormula = page.getByRole('combobox', { name: 'Quick formula' })
    await quickFormula.focus()
    await expect(quickFormula).toBeFocused()
    await expect(quickFormula).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: test.info().outputPath(`toolbar-${width}.png`) })
  })
}
