import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

for (const width of [1280, 390]) for (const edge of ['top', 'left'])
  test(`holding fill handle at ${edge} edge keeps scrolling without writing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    if (edge === 'top') await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    const address = edge === 'top' ? 'C40:C41' : 'P3'
    const coord = edge === 'top' ? '39:2' : '2:15'
    await select(page, address, coord)
    const source = cell(page, coord)
    const original = await source.textContent()
    const handle = page.getByRole('button', { name: 'Drag to fill', exact: true })
    await handle.hover()
    await page.mouse.down()
    const scroll = page.getByTestId('sheet-scroll')
    const bounds = (await scroll.boundingBox())!
    const sourceBox = (await source.boundingBox())!
    const before = await scroll.evaluate((node, side) => side === 'top' ? node.scrollTop : node.scrollLeft, edge)
    expect(before).toBeGreaterThan(120)
    await page.mouse.move(edge === 'left' ? bounds.x + 4 : sourceBox.x + sourceBox.width / 2,
      edge === 'top' ? bounds.y + 4 : sourceBox.y + sourceBox.height / 2)
    await expect.poll(() => scroll.evaluate((node, side) =>
      side === 'top' ? node.scrollTop : node.scrollLeft, edge)).toBeLessThan(before - 120)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.getByTestId('fill-preview')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Name box', exact: true })).toHaveValue(address)
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await select(page, address, coord)
    await expect(source).toHaveText(original ?? '')
    await expect(source).toHaveCSS(edge === 'top' ? 'font-style' : 'font-weight', edge === 'top' ? 'italic' : '700')
    await select(page, edge === 'top' ? 'A40' : 'A3', edge === 'top' ? '39:0' : '2:0')
    await expect(cell(page, edge === 'top' ? '39:0' : '2:0')).toHaveText(edge === 'top' ? '1' : 'SO-10002')
  })
