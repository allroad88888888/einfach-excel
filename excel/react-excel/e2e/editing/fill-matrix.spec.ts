import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { centerRowForHorizontalDrag } from '../support/fill-drag'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const name = (page: Page) => page.getByRole('textbox', { name: 'Name box' })

async function drag(page: Page, source: string, corner: string, target: string, copy = false) {
  await select(page, source, corner)
  // 窄屏只需露出源区域右下角，不假定整个矩形都放得下。
  await cell(page, corner).scrollIntoViewIfNeeded()
  const sameRow = corner.split(':')[0] === target.split(':')[0]
  if (sameRow) await centerRowForHorizontalDrag(page, corner)
  const handle = page.getByRole('button', { name: 'Drag to fill', exact: true })
  await expect(handle).toBeVisible()
  await handle.hover()
  await page.mouse.down()
  await cell(page, target).scrollIntoViewIfNeeded()
  const box = await cell(page, target).boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByTestId('fill-preview')).toBeVisible()
  if (copy) await page.keyboard.down('Control')
  await page.mouse.up()
  if (copy) await page.keyboard.up('Control')
  await expect(page.getByLabel('Fill status')).toContainText('Filled')
  await expect(page.getByTestId('fill-preview')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
})

for (const width of [1280, 390]) {
  test(`multi-column independent series and one undo at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 })
    await drag(page, 'A40:C41', '40:2', '43:2')
    await expect(name(page)).toHaveValue('A40:C44')
    await expect(cell(page, '43:2')).toHaveText('Item009')
    await expect(cell(page, '43:2')).toHaveCSS('font-style', 'italic')
    await expect(await select(page, 'B44', '43:1')).toHaveText('50')
    await expect(cell(page, '43:1')).toHaveCSS('font-weight', '700')
    await expect(await select(page, 'A44', '43:0')).toHaveText('9')
    await page.screenshot({ path: info.outputPath(`independent-columns-${width}.png`) })
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '43:0')).toHaveText('')
    await expect(await select(page, 'C44', '43:2')).toHaveText('')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, '43:2')).toHaveText('Item009')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test(`multi-row independent horizontal series at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 })
    await drag(page, 'C30:D31', '30:3', '30:5')
    await expect(name(page)).toHaveValue('C30:F31')
    await expect(cell(page, '30:5')).toHaveText('40')
    await expect(cell(page, '30:5')).toHaveCSS('font-style', 'italic')
    await expect(await select(page, 'F30', '29:5')).toHaveText('7')
    await page.screenshot({ path: info.outputPath(`independent-rows-${width}.png`) })
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, '29:5')).toHaveText('')
    await expect(await select(page, 'F31', '30:5')).toHaveText('')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, '30:5')).toHaveText('40')
  })
}

test('forced matrix copy repeats samples instead of inferring each column', async ({ page }) => {
  await drag(page, 'A40:C41', '40:2', '43:2', true)
  await expect(cell(page, '43:2')).toHaveText('Item001')
  await expect(await select(page, 'B44', '43:1')).toHaveText('10')
  await expect(await select(page, 'A44', '43:0')).toHaveText('1')
})
