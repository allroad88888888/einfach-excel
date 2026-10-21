import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })

async function expectHistory(page: Page, undo: number, redo: number) {
  await button(page, 'Recent operations').click()
  await expect(page.getByRole('dialog')).toContainText(`${undo} undo · ${redo} redo`)
  await button(page, 'Close history').click()
}

// 相同的用户输入入口：已有表头走改名，新表头走自动扩列，都必须服从原生验证。
for (const width of [1280, 390]) for (const entry of [
  { kind: 'existing', address: 'B80', coord: '79:1', original: 'Amount', column: 'B' },
  { kind: 'expanding', address: 'C80', coord: '79:2', original: '', column: 'C' },
]) test(`${entry.kind} table header rejects invalid input and preserves redo at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, entry.address, entry.coord)
  await button(page, 'Data validation').click()
  await page.getByLabel('Allow', { exact: true }).selectOption('list')
  await page.getByLabel('Items, one per line').fill('Revised')
  await button(page, 'Apply').click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  // 预留一条真正的原生 redo；拒绝草稿不能把它清掉。
  await select(page, 'H80', '79:7')
  await bar(page).fill('Keep redo'); await bar(page).press('Enter')
  await expect(cell(page, '79:7')).toHaveText('Keep redo')
  await button(page, 'Undo').click(); await expect(cell(page, '79:7')).toHaveText('')
  await select(page, entry.address, entry.coord)
  await bar(page).fill('Rejected'); await bar(page).press('Enter')
  await expect(page.getByRole('alert')).toContainText('data validation rule')
  await expect(bar(page)).toHaveValue('Rejected')
  await expect(cell(page, entry.coord)).toHaveText(entry.original)
  await expect(cell(page, '79:0')).toContainText('Product')
  await expect(cell(page, '83:1')).toHaveText('60')
  if (entry.kind === 'expanding') await expect(button(page, 'Filter DemoTable column C')).toHaveCount(0)
  await bar(page).press('Escape'); await expectHistory(page, 1, 1)
  await button(page, 'Redo').click(); await expect(cell(page, '79:7')).toHaveText('Keep redo')
  await button(page, 'Undo').click(); await expect(cell(page, '79:7')).toHaveText('')
  await select(page, entry.address, entry.coord)
  await bar(page).fill("' Revised "); await bar(page).press('Enter')
  await expect(cell(page, entry.coord)).toContainText('Revised')
  await expect(button(page, `Filter DemoTable column ${entry.column}`)).toBeVisible()
  await expect(cell(page, '83:1')).toHaveText('60')
  await button(page, 'Undo').click()
  await expect(cell(page, entry.coord)).toHaveText(entry.original)
  if (entry.kind === 'expanding') await expect(button(page, 'Filter DemoTable column C')).toHaveCount(0)
  await expectHistory(page, 1, 1)
  await button(page, 'Redo').click()
  await expect(cell(page, entry.coord)).toContainText('Revised')
  await expect(cell(page, '83:1')).toHaveText('60')
})
