import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { start, enable, open, rank, apply, visible, button, cell, dialog, menu } from '../support/top-filter'

test('data-filter is absent by default and composes with text-format through the existing header', async ({ page }) => {
  await page.goto('/?locale=en'); await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await enable(page); await open(page)
  await expect(dialog(page).getByRole('button', { name: 'Top / Bottom…' })).toHaveCount(0)
  await page.goto('/?plugins=data-filter,text-format&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await enable(page); await open(page); await rank(page); await apply(page); await visible(page, [0, 1, 2])
  await select(page, 'F3', '2:5'); await showRibbonItem(page, 'format.superscript')
  await button(page, 'Superscript').click()
  await expect(cell(page, '2:5').locator('[data-font-baseline="superscript"]')).toHaveText('100')
  await button(page, 'Undo').click(); await visible(page, [0, 1, 2])
})

test('Chinese rank condition supports keyboard submission at 390px', async ({ page }, info) => {
  await start(page, 390); await enable(page)
  await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh')
  const more = page.locator('[data-ribbon-more][aria-expanded="true"]')
  if (await more.count()) await more.click()
  // The shared grid header currently uses the same English accessible name in both locales.
  await page.getByRole('button', { name: 'Filter column F', exact: true }).click()
  await page.getByRole('button', { name: '前 / 后若干项…', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByLabel('排名方向 1', { exact: true }).selectOption('bottom')
  await page.getByLabel('排名单位 1', { exact: true }).selectOption('percent')
  await page.getByLabel('排名数量 1', { exact: true }).fill('21')
  await page.screenshot({ path: info.outputPath('rank-zh-390.png') })
  await page.getByLabel('排名数量 1', { exact: true }).press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const row of [2, 3, 4, 6, 7]) await expect(cell(page, `${row}:4`)).toHaveCount(0)
  await expect(cell(page, '5:4')).toHaveText('Keep 80')
  await expect(cell(page, '8:4')).toHaveText('Keep 70')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(cell(page, '2:4')).toHaveText('Exclude 100')
})

test('rank can be configured through the ribbon filter entry', async ({ page }) => {
  await start(page); await enable(page)
  await showRibbonItem(page, 'data.worksheet-filter'); await menu(page).selectOption('open')
  await dialog(page).getByLabel('Filter column 1', { exact: true }).selectOption('5')
  await rank(page); await apply(page); await visible(page, [0, 1, 2])
})
