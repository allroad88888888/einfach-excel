import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'

async function open(page: Page, query = '') {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto(`/e2e/fixtures/base-sales-orders/?${query}`)
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
}

test('native baselines render without installing text-format controls or compacting the font group', async ({ page }) => {
  await open(page)
  await expect(page.locator('[data-ribbon-item="format.superscript"]')).toHaveCount(0)
  await expect(page.locator('[data-ribbon-item="format.subscript"]')).toHaveCount(0)
  await showRibbonItem(page, 'format.font-family')
  await expect(page.getByRole('combobox', { name: 'Font family' })).toHaveCSS('width', '100px')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'D5:D7', '4:3')
  await expect(page.locator('td[data-cell="4:3"] [data-font-baseline="superscript"]'))
    .toHaveText('Superscript')
  await expect(page.locator('td[data-cell="5:3"] [data-font-baseline="subscript"]'))
    .toHaveText('Subscript')
  await expect(page.locator('td[data-cell="6:3"]')).toHaveText('24690')
})

test('a text-format contribution runs inside the existing font row even when its anchor is hidden', async ({ page }) => {
  await open(page, 'plugins=text-format&hide=ribbon:format.decrease-font-size')
  await select(page, 'B2', '1:1')
  await showRibbonItem(page, 'format.superscript')
  await expect(page.locator('[data-ribbon-item="format.decrease-font-size"]')).toHaveCount(0)
  const superscript = page.getByRole('button', { name: 'Superscript', exact: true })
  expect(await superscript.evaluate(button => button.closest('.ribbon-row') ===
    document.querySelector('[data-ribbon-item="format.font-size"]')?.closest('.ribbon-row'))).toBe(true)
  await expect(page.getByRole('combobox', { name: 'Font family' })).toHaveCSS('width', '88px')
  await superscript.click()
  await expect(page.locator('td[data-cell="1:1"] [data-font-baseline="superscript"]')).toHaveText('Acme Co.')
  await expect(page.locator('td[data-cell="2:1"] [data-font-baseline]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('td[data-cell="1:1"] [data-font-baseline]')).toHaveCount(0)
})

test('the host can hide a whole text-format contribution or just one of its stable controls', async ({ page }) => {
  await open(page, 'plugins=text-format&hide=ribbon:plugin:text-format:font-baseline')
  await expect(page.locator('.text-format-tools')).toHaveCount(0)
  await expect(page.locator('[data-ribbon-item="format.superscript"]')).toHaveCount(0)
  await showRibbonItem(page, 'format.font-family')
  await expect(page.getByRole('combobox', { name: 'Font family' })).toHaveCSS('width', '100px')
  await open(page, 'plugins=text-format&hide=ribbon:format.superscript')
  await select(page, 'B2', '1:1')
  await expect(page.locator('[data-ribbon-item="format.superscript"]')).toHaveCount(0)
  await showRibbonItem(page, 'format.subscript')
  await page.getByRole('button', { name: 'Subscript', exact: true }).click()
  await expect(page.locator('td[data-cell="1:1"] [data-font-baseline="subscript"]')).toHaveText('Acme Co.')
})
