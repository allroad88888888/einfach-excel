import { expect, test, type Locator, type Page } from '@playwright/test'

function cell(page: Page, coordinate: string): Locator {
  return page.locator(`[data-cell="${coordinate}"]`)
}

async function cellCenter(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error('Expected a visible grid cell')

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.describe('React controlled adapter selection', () => {
  test('projects a native pointer drag through the public adapter hooks', async ({ page }) => {
    await page.goto('/')

    const grid = page.getByTestId('react-controlled-grid')
    await expect(grid).toBeVisible()

    const origin = await cellCenter(cell(page, '0:0'))
    const destination = await cellCenter(cell(page, '2:3'))

    await page.mouse.move(origin.x, origin.y)
    await page.mouse.down()
    await page.mouse.move(destination.x, destination.y)
    await page.mouse.up()

    await expect(page.getByTestId('selection-range')).toHaveText('0:0..2:3')
    await expect(page.locator('[data-selected="true"]')).toHaveCount(12)
    await expect(cell(page, '0:0')).toHaveClass(/cell-selected/)
    await expect(cell(page, '2:3')).toHaveClass(/cell-selected/)
    await expect(cell(page, '3:3')).not.toHaveClass(/cell-selected/)
  })
})
