import { expect, test } from '@playwright/test'

// 原生 dialog 的焦点约束与窄屏排版必须在真实浏览器验证，不能只依赖 jsdom。
for (const width of [1280, 390]) {
  test(`find dialog keyboard and visual bounds at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    const grid = page.locator('[data-workbook-grid="true"]')
    await grid.focus()
    await page.keyboard.press('Control+f')
    const dialog = page.getByRole('dialog', { name: 'Find and replace' })
    const needle = dialog.getByRole('textbox', { name: 'Find what' })
    await expect(needle).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    const findTab = dialog.getByRole('tab', { name: 'Find', exact: true })
    const replaceTab = dialog.getByRole('tab', { name: 'Replace', exact: true })
    await expect(findTab).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(replaceTab).toBeFocused()
    await expect(dialog.getByRole('tabpanel', { name: 'Replace', exact: true })).toBeVisible()
    await page.keyboard.press('Home')
    await expect(findTab).toBeFocused()
    await expect(dialog.getByRole('textbox', { name: 'Replace with' })).toHaveCount(0)
    await page.keyboard.press('End')
    await expect(replaceTab).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(needle).toBeFocused()
    await needle.fill('SO-')
    await dialog.getByRole('button', { name: 'Find next', exact: true }).click()
    await expect(dialog.getByText('1 of 999 · Sales Orders!A2')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`find-replace-${width}.png`) })

    const findings = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const issues: string[] = []
      const luminance = (color: string) => {
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map((channel) => {
            const value = Number(channel) / 255
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
          })
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
      }
      for (const text of element.querySelectorAll('h2, p, label, button:not(:disabled)')) {
        const style = getComputedStyle(text)
        const background =
          style.backgroundColor === 'rgba(0, 0, 0, 0)'
            ? getComputedStyle(element).backgroundColor
            : style.backgroundColor
        const light = luminance(background)
        const dark = luminance(style.color)
        if ((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05) < 4.5)
          issues.push('low text contrast')
      }
      if (
        bounds.left < 0 ||
        bounds.right > innerWidth ||
        bounds.top < 0 ||
        bounds.bottom > innerHeight
      )
        issues.push('dialog outside viewport')
      if (element.scrollWidth > element.clientWidth) issues.push('horizontal dialog overflow')
      for (const control of element.querySelectorAll<HTMLElement>('button, input, select')) {
        const rect = control.getBoundingClientRect()
        if (rect.left < bounds.left || rect.right > bounds.right) issues.push('control clipped')
        if (parseFloat(getComputedStyle(control).fontSize) < 12) issues.push('tiny control text')
        if (!control.hasAttribute('disabled')) {
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          if (!hit || !control.contains(hit)) issues.push('control covered')
        }
      }
      return issues
    })
    expect(findings).toEqual([])
    await needle.fill('no-match-92837')
    await needle.press('Enter')
    await expect(dialog.getByText('No matches found.')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`find-empty-${width}.png`) })
    await needle.fill('a'.repeat(4097))
    await needle.press('Enter')
    await expect(dialog.getByRole('alert')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`find-error-${width}.png`) })
    const close = dialog.getByRole('button', { name: 'Close', exact: true })
    await close.focus()
    await page.keyboard.press('Tab')
    await expect(replaceTab).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(grid).toBeFocused()
    expect(errors).toEqual([])
  })
}
