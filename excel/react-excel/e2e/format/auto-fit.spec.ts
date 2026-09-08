import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await select(page, 'A2', '1:0')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('First order total')
  await expect(
    page.getByRole('separator', { name: 'Resize column E', exact: true }),
  ).toHaveAttribute('aria-disabled', 'false')
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
})

test('double-click fits a column to styled offscreen content, with one undo and redo', async ({
  page,
}) => {
  const handle = page.getByRole('separator', { name: 'Resize column E', exact: true })
  await expect(page.locator('[data-cell="89:4"]')).toHaveCount(0)
  await handle.dblclick()
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThan(250)
  const fitted = await handle.getAttribute('aria-valuenow')
  await select(page, 'E90', '89:4')
  const text = page.locator('td[data-cell="89:4"] .cell-content')
  await expect(text).toHaveText('Offscreen customer — Northwind International')
  expect(await text.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(handle).toHaveAttribute('aria-valuenow', '120')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(handle).toHaveAttribute('aria-valuenow', fitted!)
})

test('Enter fits a row to multiline Chinese content and restores grid focus', async ({ page }) => {
  await select(page, 'F90', '89:5')
  const handle = page.getByRole('separator', { name: 'Resize row 90', exact: true })
  const before = await handle.getAttribute('aria-valuenow')
  await handle.focus()
  await handle.press('Enter')
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThan(45)
  const text = page.locator('td[data-cell="89:5"] .cell-content')
  await expect(text).toHaveText('第一行\nSecond line\n第三行')
  expect(await text.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true)
  await expect(page.locator('[data-workbook-grid]')).toBeFocused()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(handle).toHaveAttribute('aria-valuenow', before!)
})

test('frozen headers stay clickable after scrolling to an automatic row fit', async ({ page }) => {
  await select(page, 'F90', '89:5')
  const corner = page.getByRole('button', { name: 'Select all cells', exact: true })
  expect((await corner.boundingBox())!.height).toBe(28)
  const row = page.getByRole('button', { name: 'Select row 90', exact: true })
  await row.click()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A90:H90')
  const handle = page.getByRole('separator', { name: 'Resize row 90', exact: true })
  await handle.dblclick()
  await expect(handle).toHaveAttribute('aria-valuenow', '51')
  expect((await corner.boundingBox())!.height).toBe(28)
})

test('formatted cross-sheet formula results participate without changing the formula', async ({
  page,
}) => {
  const handle = page.getByRole('separator', { name: 'Resize column H', exact: true })
  await handle.dblclick()
  await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).not.toBe(120)
  await select(page, 'H90', '89:7')
  const cell = page.locator('td[data-cell="89:7"]')
  await expect(cell).toHaveText('79,000,000.00')
  expect(
    await cell.locator('.cell-content').evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true)
  await expect(page.getByRole('textbox', { name: 'Active cell value', exact: true })).toHaveValue(
    "='Sales Orders'!G2*1000000",
  )
})

test('empty columns reset their override; repeated auto-fit creates no extra undo', async ({
  page,
}) => {
  const handle = page.getByRole('separator', { name: 'Resize column F', exact: true })
  await handle.dblclick()
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeLessThan(120)
  await handle.dblclick()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(handle).toHaveAttribute('aria-valuenow', '120')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  // 新建表没有合并格或内容，放大空列后自动适应应恢复默认宽度。
  await page.getByRole('button', { name: 'New sheet', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Sheet3', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('aria-label', 'Sheet3 cells')
  const empty = page.getByRole('separator', { name: 'Resize column A', exact: true })
  await expect(empty).toHaveAttribute('aria-disabled', 'false')
  await empty.press('ArrowRight')
  await expect(empty).toHaveAttribute('aria-valuenow', '130')
  await empty.dblclick()
  await expect(empty).toHaveAttribute('aria-valuenow', '120')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(empty).toHaveAttribute('aria-valuenow', '130')
})

test('a selected group fits each column independently in one undo', async ({ page }) => {
  await page.getByRole('columnheader', { name: 'Select column E', exact: true }).click()
  await page
    .getByRole('columnheader', { name: 'Select column F', exact: true })
    .click({ modifiers: ['Shift'] })
  const e = page.getByRole('separator', { name: 'Resize column E', exact: true })
  const f = page.getByRole('separator', { name: 'Resize column F', exact: true })
  await e.dblclick()
  await expect.poll(async () => Number(await e.getAttribute('aria-valuenow'))).toBeGreaterThan(250)
  expect(Number(await f.getAttribute('aria-valuenow'))).toBeLessThan(120)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(e).toHaveAttribute('aria-valuenow', '120')
  await expect(f).toHaveAttribute('aria-valuenow', '120')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})
