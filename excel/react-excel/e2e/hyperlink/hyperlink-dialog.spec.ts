import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

for (const width of [1280, 390]) for (const action of ['Open', 'Tab', 'Shift+Tab'])
  test(`${action} hyperlink dialog preserves native formulas fonts and redo at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const cell = (coord: string) => page.locator(`td[data-cell="${coord}"]`)
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    await expect(cell('1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await bar.fill('2')
    await bar.press('Enter')
    await expect(cell('1:6')).toHaveText('158')
    await button('Undo').click()
    await select(page, 'G2', '1:6')
    await button('Hyperlink').click()
    const dialog = page.getByRole('dialog', { name: 'Insert hyperlink', exact: true })
    const first = dialog.getByRole('textbox', { name: 'Link address', exact: true })
    await expect(first).toBeFocused()
    await expect(first).toHaveValue('')
    await expect(dialog.getByRole('textbox', { name: 'Display text', exact: true })).toHaveValue('79')
    if (action === 'Open') {
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      const box = (await dialog.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      await page.screenshot({ path: info.outputPath(`hyperlink-open-${width}.png`) })
    } else {
      // 合法 URL 会动态增加最后一个可聚焦链接，两种边界都必须实际按键验证。
      for (const url of ['', 'https://example.com/unsubmitted']) {
        await first.fill(url)
        const last = url ? dialog.getByRole('link', { name: 'Open link in a new tab' })
          : dialog.getByRole('button', { name: 'Insert link', exact: true })
        await (action === 'Tab' ? last : first).focus()
        await page.keyboard.press(action)
        await expect(action === 'Tab' ? first : last).toBeFocused()
      }
    }
    await button('Cancel').click()
    await expect(dialog).toHaveCount(0)
    await expect(button('Hyperlink')).toBeFocused()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('G2')
    await expect(bar).toHaveValue('=E2*F2')
    await expect(cell('1:6')).toHaveText('79')
    await expect(cell('1:6')).toHaveCSS('font-family', 'Georgia')
    await expect(cell('1:5')).toHaveText('79')
    await expect(button('Undo')).toBeDisabled()
    await button('Hyperlink').click()
    await expect(first).toHaveValue('')
    await button('Cancel').click()
    await button('Redo').click()
    await expect(cell('1:6')).toHaveText('158')
  })
