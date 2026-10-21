import { expect, type Page } from '@playwright/test'

export const cell = (page: Page, row: number, col: number) =>
  page.locator(`td[data-cell="${row}:${col}"]`)
export const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box', exact: true })

export async function openOrders(page: Page, width: number) {
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, 1, 0)).toHaveText('SO-10001')
}

export async function drag(page: Page, from: readonly [number, number], to: readonly [number, number],
  modifier?: 'Control' | 'Meta' | 'Shift') {
  const start = (await cell(page, ...from).boundingBox())!
  const end = (await cell(page, ...to).boundingBox())!
  if (modifier) await page.keyboard.down(modifier)
  try {
    await page.mouse.move(start.x + 12, start.y + 12)
    await page.mouse.down()
    await page.mouse.move(end.x + 12, end.y + 12, { steps: 4 })
    await page.mouse.up()
  } finally {
    if (modifier) await page.keyboard.up(modifier)
  }
}

export async function expectSelected(page: Page, row: number, col: number, selected = true) {
  if (selected) await expect(cell(page, row, col)).toHaveAttribute('data-selected', 'true')
  else await expect(cell(page, row, col)).not.toHaveAttribute('data-selected')
}
