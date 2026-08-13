import { expect, test } from '@playwright/test'

function cell(row: number, col: number) {
  return `[data-row="${row}"][data-col="${col}"]`
}

test('a native pointer drag projects the provider selection into the controlled grid', async ({
  page,
}) => {
  await page.goto('/')

  const start = page.locator(cell(0, 0))
  const finish = page.locator(cell(2, 2))
  await expect(start).toBeVisible()
  await expect(finish).toBeVisible()

  const startBox = await start.boundingBox()
  const finishBox = await finish.boundingBox()
  if (!startBox || !finishBox) throw new Error('The fixture cells must have browser layout boxes.')

  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(finishBox.x + finishBox.width / 2, finishBox.y + finishBox.height / 2, {
    steps: 4,
  })
  await page.mouse.up()

  await expect(page.getByTestId('selection-range')).toHaveText('0:0–2:2')
  await expect(page.locator('[data-selected="true"]')).toHaveCount(9)
  await expect(finish).toHaveAttribute('aria-selected', 'true')
})
