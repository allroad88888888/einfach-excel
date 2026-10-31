import { expect, test } from '@playwright/test'
import {
  button, cell, copyModifier, dragBorder, formula, nameBox, preview, select, start,
} from './support'

test.beforeEach(async ({ page }) => { await start(page) })

test('hovering the selection border shows the move cursor but the fill handle keeps crosshair',
  async ({ page }) => {
    await select(page, 'A1:A2', '0:0')
    const edge = page.getByTestId('drag-move-edge-top')
    await expect(edge).toBeVisible()
    await expect(edge).toHaveCSS('cursor', 'move')
    const box = (await cell(page, '0:0').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 1)
    const hovered = await page.evaluate(([x, y]) =>
      getComputedStyle(document.elementFromPoint(x, y)!).cursor, [box.x + box.width / 2, box.y + 1])
    expect(hovered).toBe('move')
    const handle = (await page.getByRole('button', { name: 'Drag to fill' }).boundingBox())!
    const corner = await page.evaluate(([x, y]) =>
      getComputedStyle(document.elementFromPoint(x, y)!).cursor,
    [handle.x + handle.width / 2, handle.y + handle.height / 2])
    expect(corner).toBe('crosshair')
  })

test('dragging the selection border moves the range and formulas follow the moved cells',
  async ({ page }) => {
    await select(page, 'A1:A2', '0:0')
    await dragBorder(page, '0:0', '4:5')
    await expect(preview(page)).toBeHidden()
    await expect(cell(page, '4:5')).toHaveText('2')
    await expect(cell(page, '5:5')).toHaveText('3')
    await expect(cell(page, '0:0')).toHaveText('')
    await expect(cell(page, '1:0')).toHaveText('')
    await expect(nameBox(page)).toHaveValue('F5:F6')
    await expect(cell(page, '0:1')).toHaveText('20')
    await expect(cell(page, '0:3')).toHaveText('5')
    await select(page, 'B1', '0:1')
    await expect(formula(page)).toHaveValue('=(F5*10)')
    await select(page, 'D1', '0:3')
    await expect(formula(page)).toHaveValue('=SUM(F5:F6)')
  })

test('holding the copy modifier at release copies the range and shifts relative formulas',
  async ({ page }) => {
    await select(page, 'A1:B1', '0:0')
    await dragBorder(page, '0:0', '9:0', { modifier: await copyModifier(page) })
    await expect(cell(page, '9:0')).toHaveText('2')
    await expect(cell(page, '9:1')).toHaveText('20')
    await expect(cell(page, '0:0')).toHaveText('2')
    await select(page, 'B10', '9:1')
    await expect(formula(page)).toHaveValue('=(A10*10)')
    await select(page, 'B1', '0:1')
    await expect(formula(page)).toHaveValue('=A1*10')
  })

test('undo restores a dragged move in one step', async ({ page }) => {
  await select(page, 'A1:A2', '0:0')
  await dragBorder(page, '0:0', '4:5')
  await expect(cell(page, '4:5')).toHaveText('2')
  await button(page, 'Undo').click()
  await expect(cell(page, '0:0')).toHaveText('2')
  await expect(cell(page, '1:0')).toHaveText('3')
  await expect(cell(page, '4:5')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
  await select(page, 'D1', '0:3')
  await expect(formula(page)).toHaveValue('=SUM(A1:A2)')
})
