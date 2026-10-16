import { expect, test } from '@playwright/test'

for (const width of [1280, 390]) {
  test(`categories expose existing tools and remain reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('[data-cell="0:0"]')).toBeVisible()
    for (const category of ['Insert', 'Formulas', 'Data', 'View', 'Start']) {
      const tab = page.getByRole('tab', { name: category, exact: true })
      await expect(tab).toBeInViewport()
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('toolbar', { name: `${category} tools` })).toBeVisible()
      await expect(page.getByRole('tablist', { name: 'Workbook commands' })
        .getByRole('tab', { selected: true })).toHaveCount(1)
      if (category === 'Insert') {
        await expect(page.getByRole('combobox', { name: 'Font family' })).toHaveCount(0)
        await page.getByRole('button', { name: 'Tables', exact: true }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.keyboard.press('Escape')
      } else if (category === 'Formulas') {
        await expect(page.getByRole('combobox', { name: 'Quick formula' })).toBeVisible()
        await expect(page.getByRole('combobox', { name: 'Sort selected range' })).toHaveCount(0)
      } else if (category === 'Data') {
        await expect(page.getByRole('combobox', { name: 'Sort selected range' })).toBeVisible()
      } else if (category === 'View') {
        await expect(page.getByRole('combobox', { name: 'Freeze panes' })).toBeVisible()
        await page.screenshot({ path: test.info().outputPath(`view-tools-${width}.png`) })
      } else {
        await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible()
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}

test('category keyboard navigation wraps and grid shortcuts still open hidden-category dialogs', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-cell="0:0"]')).toBeVisible()
  const start = page.getByRole('tab', { name: 'Start', exact: true })
  await start.focus()
  await start.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'View', exact: true })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(start).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Formulas', exact: true })).toBeFocused()
  await page.locator('[data-workbook-grid]').focus()
  await page.keyboard.press('ControlOrMeta+f')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
