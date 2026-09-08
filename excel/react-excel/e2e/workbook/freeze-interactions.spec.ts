import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('Summary native freeze seed survives switching, resizing and last-row navigation', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const fixed = page.locator('[data-frozen-pane="top"] td[data-cell="0:0"]')
  await expect(fixed).toHaveText('First order total')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  const before = (await fixed.boundingBox())!
  expect(before.height).toBe(40)
  await select(page, 'B100', '99:1')
  await expect(fixed).toBeVisible()
  expect(Math.abs((await fixed.boundingBox())!.y - before.y)).toBeLessThan(1)
  await page.setViewportSize({ width: 900, height: 620 })
  await select(page, 'B100', '99:1')
  const target = (await page.locator('td[data-cell="99:1"]').boundingBox())!
  const scroll = (await page.getByTestId('sheet-scroll').boundingBox())!
  expect(target.y + target.height).toBeLessThanOrEqual(scroll.y + scroll.height + 1)
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(page.locator('[data-frozen-pane]')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(fixed).toHaveText('First order total')
})

test('hidden frozen rows and columns collapse the bands, and native undo restores them', async ({
  page,
}) => {
  await select(page, 'C4', '3:2')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  const corner = page.locator('[data-frozen-pane="corner"]')
  await expect(corner).toBeVisible()
  const before = (await corner.boundingBox())!
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-rows')
  await expect.poll(async () => (await corner.boundingBox())!.height).toBe(before.height - 28)
  await page.getByRole('columnheader', { name: 'Select column B', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Row and column visibility' })
    .selectOption('hide-columns')
  await expect.poll(async () => (await corner.boundingBox())!.width).toBe(before.width - 120)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await corner.boundingBox())!.width).toBe(before.width)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await corner.boundingBox())!.height).toBe(before.height)
})

test('dragging from a frozen cell extends into scrolling cells and keeps autoscrolling', async ({
  page,
}) => {
  await select(page, 'B3', '2:1')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  const start = (await page
    .locator('[data-frozen-pane="corner"] td[data-cell="1:0"]')
    .boundingBox())!
  const target = (await page.locator('td[data-cell="5:3"]').boundingBox())!
  await page.mouse.move(start.x + 15, start.y + 10)
  await page.mouse.down()
  await page.mouse.move(target.x + 15, target.y + 10, { steps: 4 })
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A2:D6')
  const scroll = (await page.getByTestId('sheet-scroll').boundingBox())!
  await page.mouse.move(scroll.x + scroll.width - 3, scroll.y + scroll.height - 3, { steps: 4 })
  await expect
    .poll(() => page.getByTestId('sheet-scroll').evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100)
  await expect
    .poll(() => page.getByTestId('sheet-scroll').evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(50)
  await page.mouse.up()
})

test('Shift PageDown from a frozen cell selects into an unobscured scrolling row', async ({
  page,
}) => {
  await select(page, 'B3', '2:1')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await page.locator('[data-frozen-pane="corner"] td[data-cell="1:0"]').click()
  const grid = page.locator('[data-workbook-grid]')
  await grid.press('Shift+PageDown')
  const name = await page.getByRole('textbox', { name: 'Name box' }).inputValue()
  expect(name).toMatch(/^A2:A\d+$/)
  const row = Number(name.split(':')[1].slice(1)) - 1
  const cell = page.locator(`td[data-cell="${row}:0"]`)
  await expect(cell).toBeVisible()
  const fixed = (await page.locator('[data-frozen-pane="corner"]').boundingBox())!
  expect((await cell.boundingBox())!.y).toBeGreaterThanOrEqual(fixed.y + fixed.height - 1)
  await grid.press('Shift+PageUp')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A2')
})
