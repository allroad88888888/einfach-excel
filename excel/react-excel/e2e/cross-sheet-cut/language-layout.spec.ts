import { expect, test } from '@playwright/test'
import { button, cell, copy, select, sheet, start } from './support'

for (const width of [1280, 390]) for (const locale of ['en', 'zh']) {
  test(`cross-sheet merge rejection stays readable in ${locale} at ${width}px`, async ({ page, context }, info) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.setViewportSize({ width, height: 844 })
    await start(page)
    await select(page, 'A20', '19:0')
    await copy(page, 'Cut')
    await sheet(page, "Target O'Brien")
    await select(page, 'G20:H20', '19:6')
    await button(page, 'Paste').click()
    await expect(page.getByLabel('Clipboard status')).toContainText('Unmerge the source and destination')
    if (locale === 'zh') await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh')
    const feedback = page.getByRole('alert', { name: locale === 'zh' ? '剪贴板状态' : 'Clipboard status' })
    await expect(feedback).toContainText(locale === 'zh' ? '未移动任何单元格' : 'No cells were moved.')
    await expect(feedback).toBeInViewport()
    expect(await feedback.evaluate(node => {
      const bounds = node.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= innerWidth && node.scrollWidth <= node.clientWidth + 1
    })).toBe(true)
    await expect(cell(page, '19:6')).toHaveText('')
    await page.screenshot({ path: info.outputPath(`cross-sheet-cut-${locale}-${width}.png`) })
  })
}
