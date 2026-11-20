import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { button, cell } from '../support/date-filter'
import { launchHorizontal } from '../support/horizontal-sort'

test('Chinese horizontal sort submits by keyboard and restores focus at 390px', async ({ page }, info) => {
  await launchHorizontal(page, 390)
  await select(page, 'A1:E3', '0:0')
  await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh')
  await showRibbonItem(page, 'data.sort-left-to-right')
  const opener = button(page, '从左到右排序')
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '从左到右排序', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('排序行 1', { exact: true })).toHaveValue('1')
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('horizontal-sort-zh-390.png') })
  await button(page, '应用排序').focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(cell(page, '1:0')).toHaveText('low')
  await expect(opener).toBeFocused()
  await button(page, '撤销').click()
  await expect(cell(page, '1:0')).toHaveText('alpha')
})

test('Horizontal sort follows installation and its independent ribbon visibility', async ({ page }) => {
  for (const query of ['?locale=en', '?locale=en&plugins=data-sort&hide=ribbon:plugin:data-sort:left-to-right']) {
    await page.goto('/' + query)
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await showRibbonItem(page, 'data.sort-selected-range')
    await expect(page.locator('[data-ribbon-item="data.sort-left-to-right"]')).toHaveCount(0)
    await expect(page.locator('[data-ribbon-item="data.sort-selected-range"]').first()).toBeVisible()
  }
})
