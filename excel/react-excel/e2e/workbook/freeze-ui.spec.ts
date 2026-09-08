import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

test('freezes the first row while vertical scrolling and edits the fixed cells', async ({
  page,
}) => {
  const header = page.locator('td[data-cell="0:1"]')
  const before = (await header.boundingBox())!
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('first-row')
  const fixed = page.locator('[data-frozen-pane="top"] td[data-cell="0:1"]')
  await expect(fixed).toBeVisible()
  await page.getByTestId('sheet-scroll').evaluate((node) => {
    node.scrollTop = 1400
  })
  await expect
    .poll(async () => Math.round((await fixed.boundingBox())!.y))
    .toBe(Math.round(before.y))
  await fixed.dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toBeVisible()
  expect(Math.abs((await editor.boundingBox())!.y - before.y)).toBeLessThan(2)
  await editor.fill('Frozen customer')
  await editor.press('Enter')
  await expect(fixed).toHaveText('Frozen customer')
  await page.locator('[data-frozen-pane="top"] td[data-cell="0:2"]').dblclick()
  await expect(editor).toBeVisible()
  await editor.press('Escape')
})

test('freezes the first column while horizontal scrolling and keeps row headers aligned', async ({
  page,
}) => {
  const before = (await page.locator('td[data-cell="1:0"]').boundingBox())!
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('first-column')
  const fixed = page.locator('[data-frozen-pane="left"] td[data-cell="1:0"]')
  await expect(fixed).toBeVisible()
  await page.getByTestId('sheet-scroll').evaluate((node) => {
    node.scrollLeft = 600
  })
  await expect
    .poll(async () => Math.round((await fixed.boundingBox())!.x))
    .toBe(Math.round(before.x))
  const heading = page.getByRole('columnheader', { name: 'Select column A', exact: true })
  expect(Math.abs((await heading.boundingBox())!.x - before.x)).toBeLessThan(2)
  await fixed.dblclick()
  await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveValue(
    'SO-10001',
  )
})

test('freezes at B3, follows keyboard moves below the fixed band and unfreezes with undo', async ({
  page,
}) => {
  await select(page, 'B3', '2:1')
  const menu = page.getByRole('combobox', { name: 'Freeze panes' })
  await menu.selectOption('selection')
  await expect(page.locator('.sheet-grid-frame')).toHaveAttribute('data-frozen-rows', '2')
  await expect(page.locator('.sheet-grid-frame')).toHaveAttribute('data-frozen-cols', '1')
  await select(page, 'A500', '499:0')
  await select(page, 'B3', '2:1')
  const body = (await page.locator('td[data-cell="2:1"]').boundingBox())!
  const corner = (await page.locator('[data-frozen-pane="corner"]').boundingBox())!
  expect(body.y).toBeGreaterThanOrEqual(corner.y + corner.height - 1)
  await menu.selectOption('unfreeze')
  await expect(page.locator('[data-frozen-pane]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.sheet-grid-frame')).toHaveAttribute('data-frozen-rows', '2')
})
