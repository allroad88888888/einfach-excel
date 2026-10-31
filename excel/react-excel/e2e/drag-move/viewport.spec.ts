import { expect, test } from '@playwright/test'
import { cell, center, dragBorder, nameBox, preview, select, start } from './support'

test.beforeEach(async ({ page }) => { await start(page) })

test('a border drag from the frozen pane drops into the scrolling pane', async ({ page }) => {
  const tab = page.getByRole('tab', { name: 'Frozen', exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(cell(page, '0:0')).toHaveText('frozen')
  await select(page, 'A1', '0:0')
  await dragBorder(page, '0:0', '5:2')
  await expect(cell(page, '5:2')).toHaveText('frozen')
  await expect(cell(page, '0:0')).toHaveText('')
  await expect(nameBox(page)).toHaveValue('C6')
})

test('a border drag at 150 percent zoom drops on the cell under the pointer', async ({ page }) => {
  await page.getByRole('group', { name: 'Zoom' }).getByRole('slider', { name: 'Zoom level' })
    .fill('150')
  await expect(page.getByTestId('sheet-scroll')).toHaveAttribute('data-zoom', '150')
  await select(page, 'A1:A2', '0:0')
  await dragBorder(page, '0:0', '3:2')
  await expect(cell(page, '3:2')).toHaveText('2')
  await expect(cell(page, '4:2')).toHaveText('3')
  await expect(nameBox(page)).toHaveValue('C4:C5')
})

test('holding a border drag near the bottom edge autoscrolls the drop target', async ({ page }) => {
  await select(page, 'A1:A2', '0:0')
  const box = (await cell(page, '0:0').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 1)
  await page.mouse.down()
  await page.mouse.move(...await center(page, '3:0'), { steps: 4 })
  await expect(preview(page)).toBeVisible()
  const viewport = (await page.getByTestId('sheet-scroll').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, viewport.y + viewport.height - 6, { steps: 4 })
  await expect.poll(() => page.getByTestId('sheet-scroll').evaluate((node) => node.scrollTop))
    .toBeGreaterThan(400)
  await page.mouse.move(box.x + box.width / 2, viewport.y + viewport.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect(nameBox(page)).not.toHaveValue('A1:A2')
  const [, first] = /^A(\d+):A\d+$/.exec(await nameBox(page).inputValue())!
  expect(Number(first)).toBeGreaterThan(20)
  await expect(cell(page, `${Number(first) - 1}:0`)).toHaveText('2')
  await select(page, 'A1', '0:0')
  await expect(cell(page, '0:0')).toHaveText('')
})
