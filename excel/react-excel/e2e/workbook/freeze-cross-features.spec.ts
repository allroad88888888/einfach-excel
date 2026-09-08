import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('a merge across both freeze boundaries is editable from its fixed fragment after scrolling', async ({
  page,
}) => {
  await select(page, 'C3', '2:2')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await select(page, 'B2:D4', '1:1')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Merge cells', exact: true })
    .click()
  const fragment = page.locator('[data-frozen-pane="corner"] [data-merged-cell="true"]')
  await expect(fragment).toHaveText('Acme Co.')
  await expect(page.locator('[data-merged-cell="true"]')).toHaveCount(4)
  await page.getByTestId('sheet-scroll').evaluate((node) => {
    node.scrollTop = 700
    node.scrollLeft = 450
  })
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
  await fragment.dblclick({ position: { x: 8, y: 8 } })
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toHaveValue('Acme Co.')
  await expect(editor).toBeVisible()
  await editor.fill('Merged frozen value')
  await editor.press('Enter')
  await expect(fragment).toHaveText('Merged frozen value')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(fragment).toHaveText('Acme Co.')
})

test('large font updates only its frozen row and moves the separator with native row height', async ({
  page,
}) => {
  await select(page, 'B3', '2:1')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  const corner = page.locator('[data-frozen-pane="corner"]')
  const before = (await corner.boundingBox())!.height
  const other = (await page
    .getByRole('button', { name: 'Select row 3', exact: true })
    .boundingBox())!.height
  await select(page, 'A2', '1:0')
  await page.getByRole('combobox', { name: 'Font size', exact: true }).selectOption('36')
  await expect.poll(async () => (await corner.boundingBox())!.height).toBeGreaterThan(before)
  const header = (await page
    .getByRole('button', { name: 'Select row 2', exact: true })
    .boundingBox())!
  const cell = (await page
    .locator('[data-frozen-pane="corner"] td[data-cell="1:0"]')
    .boundingBox())!
  expect(cell.height).toBe(header.height)
  expect(
    (await page.getByRole('button', { name: 'Select row 3', exact: true }).boundingBox())!.height,
  ).toBe(other)
})

test('inserting within a frozen band moves its boundary and undo restores its geometry', async ({
  page,
}) => {
  await select(page, 'C4', '3:2')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Insert or delete rows and columns' })
    .selectOption('insert-rows')
  await expect(page.locator('.sheet-grid-frame')).toHaveAttribute('data-frozen-rows', '4')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.sheet-grid-frame')).toHaveAttribute('data-frozen-rows', '3')
  await expect(page.locator('[data-frozen-pane="corner"] td[data-cell="1:0"]')).toHaveText(
    'SO-10001',
  )
})

test('freeze panes stay aligned and usable on desktop and narrow screens', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await select(page, 'B3', '2:1')
    const menu = page.getByRole('combobox', { name: 'Freeze panes' })
    await menu.scrollIntoViewIfNeeded()
    await menu.selectOption('selection')
    await expect(page.locator('[data-frozen-pane="corner"]')).toBeVisible()
    await page.getByTestId('sheet-scroll').evaluate((node) => {
      node.scrollTop = 700
      node.scrollLeft = 400
    })
    // scroll 事件在下一帧才发出，不能只检查旧帧原本就是 false 的 retained 标志。
    await expect(page.locator('[data-frozen-pane="left"] td[data-cell="27:0"]')).toHaveText('SO-10027')
    await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
      'data-projection-retained',
      'false',
    )
    await expect(menu).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const corner = (await page.locator('[data-frozen-pane="corner"]').boundingBox())!
    const left = (await page.locator('[data-frozen-pane="left"]').boundingBox())!
    const top = (await page.locator('[data-frozen-pane="top"]').boundingBox())!
    expect(left.x).toBe(corner.x)
    expect(top.y).toBe(corner.y)
    expect(left.y).toBe(corner.y + corner.height)
    expect(top.x).toBe(corner.x + corner.width)
    await page.screenshot({ path: info.outputPath(`freeze-${width}.png`), fullPage: true })
    await menu.selectOption('unfreeze')
    await expect(page.locator('[data-frozen-pane]')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})
