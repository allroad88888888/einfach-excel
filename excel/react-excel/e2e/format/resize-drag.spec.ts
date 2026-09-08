import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await select(page, 'A2', '1:0')
})

for (const axis of ['row', 'column'] as const) {
  test(`drag ${axis} previews one boundary and undo restores its native size`, async ({ page }) => {
    const label = axis === 'row' ? '2' : 'B'
    const header = page.getByRole(axis === 'row' ? 'button' : 'columnheader', {
      name: `Select ${axis} ${label}`,
      exact: true,
    })
    const before = (await header.boundingBox())!
    const handle = page.getByRole('separator', { name: `Resize ${axis} ${label}`, exact: true })
    const box = (await handle.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      box.x + box.width / 2 + (axis === 'column' ? 55 : 0),
      box.y + box.height / 2 + (axis === 'row' ? 45 : 0),
    )
    await expect(page.locator('.resize-guide')).toBeVisible()
    expect((await header.boundingBox())![axis === 'row' ? 'height' : 'width']).toBe(
      before[axis === 'row' ? 'height' : 'width'],
    )
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.mouse.up()
    const dimension = axis === 'row' ? 'height' : 'width'
    await expect
      .poll(async () => (await header.boundingBox())![dimension])
      .toBe(before[dimension] + (axis === 'row' ? 45 : 55))
    await expect(page.getByRole('dialog', { name: 'Row and column size' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(async () => (await header.boundingBox())![dimension]).toBe(before[dimension])
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}

test('Escape discards the guide, and keyboard resizing still writes one undoable size', async ({
  page,
}) => {
  const handle = page.getByRole('separator', { name: 'Resize column B', exact: true })
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 2, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + 10)
  await expect(page.locator('.resize-guide')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('.resize-guide')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await handle.focus()
  await handle.press('ArrowRight')
  await expect(handle).toHaveAttribute('aria-valuenow', '130')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(handle).toHaveAttribute('aria-valuenow', '120')
})

test('dragging a selected row resizes the whole row selection with one undo', async ({ page }) => {
  const row3 = page.getByRole('button', { name: 'Select row 3', exact: true })
  const row4 = page.getByRole('button', { name: 'Select row 4', exact: true })
  await row3.click()
  await row4.click({ modifiers: ['Shift'] })
  const handle = page.getByRole('separator', { name: 'Resize row 3', exact: true })
  const before = (await row3.boundingBox())!.height
  const before4 = (await row4.boundingBox())!.height
  const other = (await page
    .getByRole('button', { name: 'Select row 5', exact: true })
    .boundingBox())!.height
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 10, box.y + 32)
  await page.mouse.up()
  await expect.poll(async () => (await row3.boundingBox())!.height).toBe(before + 30)
  expect((await row4.boundingBox())!.height).toBe(before + 30)
  expect(
    (await page.getByRole('button', { name: 'Select row 5', exact: true }).boundingBox())!.height,
  ).toBe(other)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await row3.boundingBox())!.height).toBe(before)
  expect((await row4.boundingBox())!.height).toBe(before4)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('a frozen column resize updates the separator, header and edited cell together', async ({
  page,
}) => {
  await select(page, 'B3', '2:1')
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('selection')
  await page.getByTestId('sheet-scroll').evaluate((node) => {
    node.scrollLeft = 400
    node.scrollTop = 700
  })
  await expect(page.locator('[data-frozen-pane="left"] td[data-cell="27:0"]')).toHaveText(
    'SO-10027',
  )
  const handle = page.getByRole('separator', { name: 'Resize column A', exact: true })
  const before = (await page.locator('[data-frozen-pane="corner"]').boundingBox())!
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 2, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 62, box.y + 10)
  await expect(page.locator('.resize-guide-column')).toBeVisible()
  await page.mouse.up()
  await expect
    .poll(async () => (await page.locator('[data-frozen-pane="corner"]').boundingBox())!.width)
    .toBe(before.width + 60)
  const cell = page.locator('[data-frozen-pane="corner"] td[data-cell="1:0"]')
  await cell.dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  expect((await editor.boundingBox())!.width).toBe(before.width + 60)
  await editor.press('Escape')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => (await page.locator('[data-frozen-pane="corner"]').boundingBox())!.width)
    .toBe(before.width)
})
