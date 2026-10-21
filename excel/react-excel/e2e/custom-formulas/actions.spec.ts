import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, editor, openEditor, register, choose, inputFormula, neighbors } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const width of [1280, 390]) {
  test(`open custom formula directory reads native definitions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await openEditor(page)
    await expect(page.getByLabel('Function name', { exact: true })).toBeFocused()
    await expect(button(page, 'Remove formula')).toBeDisabled()
    await button(page, 'Cancel').click()
    await expect(button(page, 'Undo')).toBeDisabled(); await neighbors(page)
  })

  test(`register custom expression leaves user cells unchanged at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await select(page, 'K3', '2:10')
    await expect(cell(page, '2:10')).toHaveText('2026-09-04')
    await register(page)
    await expect(button(page, 'Custom formulas')).toBeFocused()
    await choose(page)
    await expect(page.getByLabel('Formula expression', { exact: true })).toHaveValue('=amount*2')
    await expect(page.getByLabel('Parameters, separated by commas', { exact: true })).toHaveValue('AMOUNT')
    await button(page, 'Cancel').click(); await neighbors(page)
    await select(page, 'K3', '2:10')
    await expect(cell(page, '2:10')).toHaveText('2026-09-04')
  })

  test(`call registered expression from formula bar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await register(page); await inputFormula(page)
    await expect(cell(page, '2:10')).toHaveText('4'); await neighbors(page)
  })

  test(`select saved custom definition reads native expression at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await register(page); await choose(page)
    await expect(page.getByLabel('Function name', { exact: true })).toHaveValue('DOUBLE')
    await expect(page.getByLabel('Function name', { exact: true })).toHaveAttribute('readonly', '')
    await expect(page.getByLabel('Formula expression', { exact: true })).toHaveValue('=amount*2')
    await button(page, 'Cancel').click(); await neighbors(page)
  })

  test(`replace custom expression recalculates existing callers at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await register(page); await inputFormula(page); await choose(page)
    await page.getByLabel('Formula expression', { exact: true }).fill('=amount*3')
    await button(page, 'Replace formula').click()
    await expect(cell(page, '2:10')).toHaveText('6'); await neighbors(page)
  })

  test(`remove custom expression returns native name error at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await register(page); await inputFormula(page); await choose(page)
    await button(page, 'Remove formula').click()
    await expect(cell(page, '2:10')).toHaveText('#NAME?')
    await openEditor(page)
    await expect(page.getByLabel('Saved formula', { exact: true }).locator('option[value="DOUBLE"]')).toHaveCount(0)
    await button(page, 'Cancel').click(); await neighbors(page)
  })

  test(`cancel custom expression draft preserves saved definition at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await register(page); await choose(page)
    await page.getByLabel('Formula expression', { exact: true }).fill('=amount*99')
    await button(page, 'Cancel').click(); await choose(page)
    await expect(page.getByLabel('Formula expression', { exact: true })).toHaveValue('=amount*2')
    await button(page, 'Cancel').click(); await neighbors(page)
  })

  test(`Escape dismisses custom expression draft at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await openEditor(page); await page.getByLabel('Function name', { exact: true }).fill('DISCARD')
    await page.getByLabel('Function name', { exact: true }).press('Escape')
    await expect(editor(page)).toHaveCount(0); await expect(button(page, 'Custom formulas')).toBeFocused()
    await expect(button(page, 'Undo')).toBeDisabled(); await neighbors(page)
  })

  test(`new custom formula mode clears selected draft at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await register(page); await choose(page)
    await page.getByLabel('Saved formula', { exact: true }).selectOption('')
    await expect(page.getByLabel('Function name', { exact: true })).toBeEditable()
    await expect(page.getByLabel('Function name', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Formula expression', { exact: true })).toHaveValue('')
    await button(page, 'Cancel').click(); await neighbors(page)
  })

  test(`custom formula dialog traps focus and fits viewport at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 })
    await openEditor(page)
    await page.getByLabel('Saved formula', { exact: true }).focus()
    await page.getByLabel('Saved formula', { exact: true }).press('Shift+Tab')
    await expect(button(page, 'Register formula')).toBeFocused()
    await button(page, 'Register formula').press('Tab')
    await expect(page.getByLabel('Saved formula', { exact: true })).toBeFocused()
    const bounds = await editor(page).boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`custom-formulas-${width}.png`) })
    await button(page, 'Cancel').click(); await neighbors(page)
  })
}
