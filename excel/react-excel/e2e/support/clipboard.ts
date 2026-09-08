import { expect, type Page } from '@playwright/test'

/** 剪贴板用例共用真实名称框定位，等待可编辑的 Rust 投影。 */
export async function select(page: Page, address: string, coord: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  const cell = page.locator(`td[data-cell="${coord}"]`)
  await expect(cell).toBeVisible()
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
  return cell
}

export async function copy(page: Page, operation: 'Copy' | 'Cut' = 'Copy') {
  await page.getByRole('button', { name: operation, exact: true }).click()
  await expect(page.getByLabel('Clipboard status')).toContainText(
    operation === 'Copy' ? 'Copied' : 'ready to move',
  )
}

export async function paste(page: Page, name = 'Paste') {
  await page.getByRole('button', { name, exact: true }).click()
  await expect(page.getByLabel('Clipboard status')).toHaveText('Pasted cells.')
}

export async function pasteOption(page: Page, option: string) {
  const menu = page.getByRole('combobox', { name: 'More paste options' })
  await menu.scrollIntoViewIfNeeded()
  await menu.selectOption(option)
  await expect(page.getByLabel('Clipboard status')).toHaveText('Pasted cells.')
}
