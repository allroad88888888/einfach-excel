import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const status = (page: Page) => page.locator('[data-sample-plugin="panel"]')

async function open(page: Page, query: string) {
  await page.goto(`/${query}`)
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
}

test('a plugin ribbon group dispatches its own command', async ({ page }) => {
  await open(page, '?plugins=sample')
  await expect(status(page)).toHaveText('Sample pings: 0')
  await page.getByRole('button', { name: 'Sample ping' }).click()
  await expect(status(page)).toHaveText('Sample pings: 1')
})

test('a plugin context menu item runs after the built-in items', async ({ page }) => {
  await open(page, '?plugins=sample')
  await cell(page, '2:1').click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Cell actions' })
  await expect(menu.getByRole('menuitem')).toHaveText(['Insert…', 'Delete…', 'Sample ping'])
  await menu.getByRole('menuitem', { name: 'Sample ping' }).click()
  await expect(menu).toBeHidden()
  await expect(status(page)).toHaveText('Sample pings: 1')
})

test('a plugin editor adornment follows the cell editing session', async ({ page }) => {
  await open(page, '?plugins=sample')
  const marker = page.locator('[data-sample-plugin="editor"]')
  await expect(marker).toHaveCount(0)
  await cell(page, '2:1').dblclick()
  await expect(marker).toHaveText('Sample plugin sees editing')
  await page.keyboard.press('Escape')
  await expect(marker).toHaveCount(0)
})

test('plugin messages follow the workbook locale', async ({ page }) => {
  await open(page, '?plugins=sample&locale=zh')
  await expect(status(page)).toHaveText('示例插件计数：0')
  await expect(page.getByRole('button', { name: '示例插件计数' })).toBeVisible()
})

test('the workbook mounts no plugin contribution without plugins', async ({ page }) => {
  await open(page, '')
  await expect(page.locator('[data-plugin], [data-sample-plugin]')).toHaveCount(0)
  await cell(page, '2:1').click({ button: 'right' })
  await expect(page.getByRole('menu', { name: 'Cell actions' }).getByRole('menuitem')).toHaveCount(2)
})
