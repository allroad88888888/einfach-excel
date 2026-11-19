import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile } from '../support/conditional-dates'
import { cell, button, gradientWorkbook, openGradient, applyGradient, nativeWorkbook } from '../support/gradient-fill'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, gradientWorkbook); await select(page, 'B2', '1:1')
})

test('Invalid gradient input leaves a correctable draft without changing native history', async ({ page }) => {
  const before = await nativeWorkbook(page)
  await openGradient(page)
  for (const invalid of ['NaN', 'Infinity', '1e309', '']) {
    await page.getByLabel('Angle (degrees)', { exact: true }).fill(invalid)
    await button(page, 'Apply fill').click()
    await expect(page.getByRole('alert')).toContainText('finite angle')
    await expect(page.getByLabel('Angle (degrees)', { exact: true })).toHaveValue(invalid)
  }
  await page.getByLabel('Gradient type', { exact: true }).selectOption('path-gradient')
  await page.getByLabel('Right (%)', { exact: true }).fill('101')
  await button(page, 'Apply fill').click(); await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Right (%)', { exact: true }).fill('80')
  await applyGradient(page)
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('Cancel discards the gradient draft and restores the existing persisted fill', async ({ page }) => {
  const before = await nativeWorkbook(page)
  await openGradient(page, 'path-gradient'); await page.getByLabel('Left (%)', { exact: true }).fill('5')
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await nativeWorkbook(page)).toEqual(before)
  await openGradient(page); await expect(page.getByLabel('Angle (degrees)', { exact: true })).toHaveValue('-450')
  await button(page, 'Cancel').click()
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('Escape closes the gradient dialog without a write and returns focus to its trigger', async ({ page }) => {
  const before = await nativeWorkbook(page)
  await openGradient(page); await page.getByLabel('Angle (degrees)', { exact: true }).fill('123')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(button(page, 'Gradient fill')).toBeFocused()
  expect(await nativeWorkbook(page)).toEqual(before)
  await expect(cell(page, '1:2')).toHaveCSS('background-image', 'none')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('Solid fill and No fill replace both gradient variants and undo restores every stop', async ({ page }) => {
  for (const mode of ['linear-gradient', 'path-gradient'] as const) {
    await openGradient(page, mode); await applyGradient(page)
    const before = await nativeWorkbook(page)
    await showRibbonItem(page, 'format.fill-color-palette'); await button(page, 'Choose fill color').click()
    await button(page, 'No fill').click()
    await expect(cell(page, '1:1')).toHaveCSS('background-image', 'none')
    await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
    await showRibbonItem(page, 'format.fill-color')
    await button(page, 'Fill color').click()
    await expect(cell(page, '1:1')).toHaveCSS('background-image', 'none')
    await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
  }
})
