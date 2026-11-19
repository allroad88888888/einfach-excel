import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile } from '../support/conditional-dates'
import { cell, button, gradientWorkbook, openGradient, applyGradient, nativeWorkbook } from '../support/gradient-fill'

for (const mode of ['linear-gradient', 'path-gradient'] as const)
test(`conditional background temporarily hides ${mode} and restores the exact native fill`, async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, gradientWorkbook)
  await select(page, 'D2', '1:3'); await openGradient(page, mode); await applyGradient(page)
  const before = (await nativeWorkbook(page)).formats
  const image = await cell(page, '1:3').evaluate(node => getComputedStyle(node).backgroundImage)
  await showRibbonItem(page, 'format.conditional-formatting'); await button(page, 'Conditional formatting').click()
  await page.getByLabel('Value', { exact: true }).fill('10')
  await page.getByLabel('Highlight fill', { exact: true }).fill('#00ff00'); await button(page, 'Add rule').click()
  await expect(cell(page, '1:3')).toHaveCSS('background-image', 'none')
  await expect(cell(page, '1:3')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  expect((await nativeWorkbook(page)).formats).toEqual(before)
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('=2/2'); await input.press('Enter')
  await expect(cell(page, '1:3')).toHaveCSS('background-image', image)
  await button(page, 'Undo').click(); await expect(cell(page, '1:3')).toHaveCSS('background-image', 'none')
  await button(page, 'Undo').click(); await expect(cell(page, '1:3')).toHaveCSS('background-image', image)
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
})
