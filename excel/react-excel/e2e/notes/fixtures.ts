import { expect, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const marker = (page: Page, coord: string) => cell(page, coord).locator('[data-cell-note]')
export const editor = (page: Page) => page.getByRole('dialog', { name: /^(Insert|Edit) note$/ })
export async function openNote(page: Page) {
  await button(page, 'Note').click()
  await expect(editor(page)).toBeVisible()
  await expect(page.getByLabel('Note text', { exact: true })).toBeEnabled()
  await expect(page.getByLabel('Note text', { exact: true })).toBeFocused()
}
export async function createNote(page: Page, address = 'A2', coord = '1:0', text = 'First line\n第二行') {
  await select(page, address, coord)
  await openNote(page)
  await page.getByLabel('Note text', { exact: true }).fill(text)
  await button(page, 'Insert note').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(marker(page, coord)).toHaveCount(1)
}
export async function expectNeighbors(page: Page) {
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(cell(page, '2:0')).toHaveText('SO-10002')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '1:6')).toHaveText('79')
}
