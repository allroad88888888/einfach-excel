import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const frame = (page: Page) => page.locator('.sheet-grid-frame').first()
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' })
const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function open(page: Page, query = '') {
  await page.goto(`/${query}`)
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
}

test('hiding gridlines clears the cell grid but keeps it per sheet', async ({ page }) => {
  await open(page)
  const before = await cell(page, '2:1').evaluate(el => getComputedStyle(el).borderRightColor)
  expect(before).not.toBe('rgba(0, 0, 0, 0)')
  await tool(page, 'Gridlines').click()
  await expect(tool(page, 'Gridlines')).toHaveAttribute('aria-pressed', 'false')
  await expect(frame(page)).toHaveAttribute('data-gridlines', 'hidden')
  await expect.poll(() => cell(page, '2:1').evaluate(el => getComputedStyle(el).borderRightColor))
    .toBe('rgba(0, 0, 0, 0)')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(tool(page, 'Gridlines')).toHaveAttribute('aria-pressed', 'true')
  await expect(frame(page)).not.toHaveAttribute('data-gridlines', 'hidden')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(frame(page)).toHaveAttribute('data-gridlines', 'hidden')
})

test('hiding headings removes row and column headers and keeps clicks on the right cell', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('columnheader', { name: 'Select column B', exact: true })).toBeVisible()
  await tool(page, 'Headings').click()
  await expect(tool(page, 'Headings')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('columnheader', { name: 'Select column B', exact: true })).toHaveCount(0)
  await expect(frame(page)).toHaveAttribute('data-gutter', '0')
  await cell(page, '3:2').click()
  await expect(nameBox(page)).toHaveValue('C4')
  await cell(page, '3:2').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toBeVisible()
  const [editorBox, cellBox] = [await editor.boundingBox(), await cell(page, '3:2').boundingBox()]
  expect(Math.abs(editorBox!.x - cellBox!.x)).toBeLessThan(3)
  expect(Math.abs(editorBox!.y - cellBox!.y)).toBeLessThan(3)
  await page.keyboard.press('Escape')
  await tool(page, 'Headings').click()
  await expect(page.getByRole('columnheader', { name: 'Select column B', exact: true })).toBeVisible()
})

test('the formula bar can be hidden and shown again', async ({ page }) => {
  await open(page)
  await expect(nameBox(page)).toBeVisible()
  await tool(page, 'Formula bar').click()
  await expect(nameBox(page)).toHaveCount(0)
  await tool(page, 'Formula bar').click()
  await expect(nameBox(page)).toBeVisible()
})

test('hidden gridlines repaint the canvas renderer without losing cells', async ({ page }) => {
  await page.goto('/?renderer=canvas')
  const canvas = page.getByRole('img', { name: 'Canvas worksheet cells' }).first()
  await expect(canvas).toBeVisible()
  await tool(page, 'Gridlines').click()
  await expect(frame(page)).toHaveAttribute('data-gridlines', 'hidden')
  await expect(canvas).toBeVisible()
  await expect.poll(() => canvas.getAttribute('data-painted-cells')).not.toBe('0')
})
