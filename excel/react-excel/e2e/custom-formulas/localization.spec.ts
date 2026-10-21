import { expect, test } from '@playwright/test'
import { button, cell, choose, neighbors } from './fixtures'

for (const width of [1280, 390]) test(`Chinese custom formula editor preserves definitions after language change at ${width}px`,
  async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/?locale=zh-CN')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await button(page, '自定义公式').click()
    await page.getByLabel('函数名称', { exact: true }).fill('GREETING')
    await page.getByLabel('参数，以逗号分隔', { exact: true }).fill('name')
    await page.getByLabel('公式表达式', { exact: true }).fill('="你好，"&name')
    await button(page, '注册公式').click()
    await button(page, '自定义公式').click()
    await page.getByLabel('已保存的公式', { exact: true }).selectOption('GREETING')
    await expect(page.getByLabel('公式表达式', { exact: true })).toHaveValue('="你好，"&name')
    await page.screenshot({ path: testInfo.outputPath(`custom-formulas-zh-${width}.png`) })
    await button(page, '取消').click()
    await page.getByRole('combobox', { name: '界面语言' }).selectOption('en')
    await choose(page, 'GREETING')
    await expect(page.getByLabel('Formula expression', { exact: true })).toHaveValue('="你好，"&name')
    await button(page, 'Cancel').click(); await neighbors(page)
  })
