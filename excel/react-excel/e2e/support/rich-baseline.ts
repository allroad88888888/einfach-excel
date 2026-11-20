import { expect, type Locator, type Page } from '@playwright/test'
import { showRibbonItem } from './ribbon'

export const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true })
export const cell = (page: Page, coordinate: string) => page.locator(`td[data-cell="${coordinate}"]`)
export const dialog = (page: Page) => page.getByRole('dialog', { name: /^Rich text/ })
export const text = (page: Page) => dialog(page).getByRole('textbox', { name: 'Cell text', exact: true })

export async function start(page: Page, width = 1280, extra = '') {
  await page.setViewportSize({ width, height: 850 })
  await page.goto(`/?plugins=text-format&locale=en${extra}`)
  if (extra.includes('renderer=canvas')) await expect(page.locator('[data-workbook-grid] canvas')).toBeVisible()
  else await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
}
export async function go(page: Page, address: string) {
  const name = page.getByRole('textbox', { name: 'Name box', exact: true })
  await name.fill(address); await name.press('Enter'); await expect(name).toHaveValue(address)
  await expect(name).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}
export async function open(page: Page, address: string) {
  await go(page, address); await showRibbonItem(page, 'format.rich-text')
  await button(page, 'Rich text').click(); await expect(dialog(page)).toBeVisible()
}
/** Native caret movement: counts Unicode characters, without assigning selection state. */
export async function selectText(editor: Locator, start: number, count: number) {
  await editor.focus(); await editor.press('Home')
  for (let i = 0; i < start; i++) await editor.press('ArrowRight')
  for (let i = 0; i < count; i++) await editor.press('Shift+ArrowRight')
}
export async function save(page: Page) {
  await button(dialog(page), 'Save changes').click(); await expect(dialog(page)).toHaveCount(0)
}
export async function boxes(target: Locator) {
  return target.locator('.cell-content > span').evaluateAll(spans => spans.map(span => {
    const range = document.createRange(); range.selectNodeContents(span)
    const box = range.getBoundingClientRect()
    return { text: span.textContent, height: box.height, center: box.y + box.height / 2 }
  }))
}
