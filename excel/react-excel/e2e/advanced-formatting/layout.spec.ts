import { expect, test } from '@playwright/test'
import { start, open, button, dialog, cleanNeighbor } from './support'

for (const width of [1280, 390]) {
  test(`advanced text comparison editor fits English and Chinese at ${width}px`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await start(page, width, ['中文🙂*', '1'])
    await open(page, 'text')
    await page.getByLabel('Text condition', { exact: true }).selectOption('matches-wildcard')
    await page.getByLabel('Matching text', { exact: true }).fill('中文?~*')
    expect(await dialog(page).evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`advanced-formatting-text-en-${width}.png`), fullPage: true })
    await page.getByLabel('Rule type', { exact: true }).selectOption('duplicate-values')
    await page.getByLabel('Compare by', { exact: true }).selectOption('display-text')
    expect(await dialog(page).evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`advanced-formatting-comparison-en-${width}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByRole('combobox', { name: 'Interface language', exact: true }).selectOption('zh')
    await button(page, '条件格式').click()
    const localized = page.getByRole('dialog', { name: '条件格式', exact: true })
    await expect(localized).toBeVisible()
    await localized.getByLabel('规则类型', { exact: true }).selectOption('text')
    await localized.locator('select[id$="-condition"]').selectOption('matches-wildcard')
    await localized.locator('input[id$="-match-text"]').fill('中文?~*')
    expect(await localized.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`advanced-formatting-text-zh-${width}.png`), fullPage: true })
    await localized.getByLabel('规则类型', { exact: true }).selectOption('duplicate-values')
    await localized.locator('select[id$="-compare-by"]').selectOption('display-text')
    expect(await localized.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`advanced-formatting-comparison-zh-${width}.png`), fullPage: true })
    await page.keyboard.press('Escape'); await cleanNeighbor(page)
    expect(errors).toEqual([])
  })
}
