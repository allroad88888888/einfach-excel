import { expect, test } from '@playwright/test'
import { cell, controlledJson, formula, openAsyncDemo, write } from '../async-formulas/fixtures'

for (const width of [1280, 390]) for (const locale of ['en', 'zh'] as const) {
  test(`real asynchronous formula pending and settled views fit ${locale} at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 850 })
    await openAsyncDemo(page)
    const http = await controlledJson(page, 'layout')
    const source = formula('layout', '/price')
    await write(page, 'B3', '2:1', source)
    await expect(cell(page, '2:1')).toHaveText('#BUSY!')
    await expect(cell(page, '2:2')).toHaveText('#BUSY!')
    if (locale === 'zh')
      await page.getByRole('combobox', { name: 'Interface language', exact: true }).selectOption('zh')
    const bar = page.getByRole('textbox', {
      name: locale === 'zh' ? '活动单元格内容' : 'Active cell value', exact: true,
    })
    await expect(bar).toHaveValue(source)
    await expect(cell(page, '2:1')).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`async-formulas-${locale}-${width}-pending.png`) })
    await http.release(0, { price: 7 })
    await expect(cell(page, '2:1')).toHaveText('7')
    await expect(cell(page, '2:2')).toHaveText('14')
    await expect(bar).toHaveValue(source)
    await expect(page.getByRole('combobox', {
      name: locale === 'zh' ? '重新计算' : 'Recalculate', exact: true,
    })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`async-formulas-${locale}-${width}-settled.png`) })
    expect(errors).toEqual([])
  })
}
