import { expect, test, type Locator, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

async function write(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await input.fill(value)
  await input.press('Enter')
}

async function fitsViewport(locator: Locator, width: number) {
  const box = (await locator.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(await locator.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
}

const labels = {
  en: { tab: 'Formulas', evaluate: 'Evaluate Formula', watch: 'Watch Window', add: 'Add Watch',
    run: 'Evaluate', name: 'Name manager', cancel: 'Cancel', close: 'Close' },
  zh: { tab: '公式', evaluate: '公式求值', watch: '监视窗口', add: '添加监视',
    run: '求值', name: '名称管理器', cancel: '取消', close: '关闭' },
}

// Supplement the action-specific primary tests with real rendered geometry and screenshots.
for (const width of [1280, 390]) for (const locale of ['en', 'zh'] as const) {
  test(`formula controls and panels keep styled geometry at ${width}px in ${locale}`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
    const language = page.getByRole('combobox', { name: /Interface language|界面语言/ })
    await language.selectOption('en')
    await page.getByRole('button', { name: 'New sheet', exact: true }).click()
    await write(page, 'D1', '0:3', '10')
    await write(page, 'E1', '0:4', '=D1*2')
    await write(page, 'F1', '0:5', '=E1+5')
    await write(page, 'G1', '0:6', '99')
    await select(page, 'F1', '0:5')
    await language.selectOption(locale)
    const text = labels[locale]
    await page.getByRole('tab', { name: text.tab, exact: true }).click()

    const toolbar = page.locator('[data-formula-auditing-toolbar]')
    await expect(toolbar.getByRole('button')).toHaveCount(5)
    for (const button of await toolbar.getByRole('button').all()) {
      await expect(button).toHaveCSS('border-top-style', 'none')
      await expect(button).toHaveCSS('font-size', '12px')
      await expect(button).toHaveCSS('height', '28px')
      await expect(button.locator('svg')).toHaveCount(1)
    }
    for (const id of ['iterative-max-iterations', 'iterative-max-change']) {
      const input = page.getByTestId(id)
      await expect(input).toHaveCSS('border-top-style', 'solid')
      await expect(input).toHaveCSS('font-size', '12px')
      await expect(input).toHaveCSS('height', '28px')
      expect(await input.evaluate(node => !!node.closest('label')?.innerText.trim())).toBe(true)
    }
    const toggle = page.getByTestId('iterative-calculation-toggle')
    await expect(toggle).toHaveCSS('display', 'flex')
    expect(await toggle.evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true)

    await page.getByRole('button', { name: text.evaluate, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: text.evaluate, exact: true })
    await expect(dialog.getByRole('button', { name: text.run, exact: true })).toBeFocused()
    await expect(dialog).toHaveCSS('border-top-style', 'solid')
    await expect(dialog.getByRole('button', { name: text.run, exact: true })).toHaveCSS('font-size', '12px')
    await fitsViewport(dialog, width)
    await page.screenshot({ path: info.outputPath('evaluate.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    await page.getByRole('button', { name: text.watch, exact: true }).click()
    const watch = page.getByRole('region', { name: text.watch, exact: true })
    await watch.getByRole('button', { name: text.add, exact: true }).click()
    await expect(watch.locator('[data-watch-col="value"]')).toHaveText('25')
    await fitsViewport(watch, width)
    for (const control of await watch.locator('input, button').all()) {
      const outer = (await watch.boundingBox())!
      const box = (await control.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(outer.x)
      expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width)
    }
    await page.screenshot({ path: info.outputPath('watch.png') })
    await watch.getByRole('button', { name: text.close, exact: true }).click()

    await page.getByRole('button', { name: text.name, exact: true }).click()
    const names = page.getByRole('dialog', { name: text.name, exact: true })
    await expect(names).toBeVisible()
    await fitsViewport(names, width)
    await page.screenshot({ path: info.outputPath('names.png') })
    await names.getByRole('button', { name: text.cancel, exact: true }).click()
    await expect(page.locator('td[data-cell="0:5"]')).toHaveText('25')
    // Keep the sentinel in view even when mobile navigation scrolls the grid.
    await language.selectOption('en')
    await select(page, 'G1', '0:6')
    await expect(page.locator('td[data-cell="0:6"]')).toHaveText('99')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
