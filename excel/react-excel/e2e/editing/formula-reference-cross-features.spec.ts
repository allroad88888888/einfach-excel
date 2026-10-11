import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

test('typing equals directly starts reference picking and Enter writes the original cell', async ({ page }) => {
  const target = await select(page, 'B2', '1:1')
  await page.locator('[data-workbook-grid]').press('=')
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await expect(editor).toHaveValue('=')
  await page.locator('td[data-cell="1:4"]').click()
  await expect(editor).toHaveValue('=E2')
  await editor.press('Enter')
  await expect(target).toHaveText('1')
})

test('a frozen header can be referenced after scroll without replacing the edit source', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Freeze panes' }).selectOption('first-row')
  const target = await select(page, 'B50', '49:1')
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await input.fill('=LEN(')
  await page.locator('[data-frozen-pane="top"] td[data-cell="0:0"]').click()
  await expect(input).toHaveValue('=LEN(A1')
  await expect(input).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B50')
  await input.pressSequentially(')')
  await input.press('Enter')
  await expect(target).toHaveText('5')
})

for (const { direction, height } of [
  { direction: 'down', height: 720 },
  { direction: 'right', height: 720 },
  { direction: 'down', height: 560 },
] as const) {
  test(`reference drag autoscrolls ${direction}, keeps input focus and calculates the full range at ${height}px height`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height })
    await select(page, 'B2', '1:1')
    const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await input.fill(direction === 'down' ? '=SUM(' : '=COUNTA(')
    const referenceEnd = async () => {
      const draft = await input.inputValue()
      const match = (direction === 'down' ? /^=SUM\(E2:E(\d+)$/ : /^=COUNTA\(E6:([A-Z]+)6$/).exec(draft)
      if (match === null) return 0
      return direction === 'down' ? Number(match[1])
        : [...match[1]].reduce((col, ch) => col * 26 + ch.charCodeAt(0) - 64, 0)
    }
    const start = (await page.locator(`td[data-cell="${direction === 'down' ? 1 : 5}:4"]`).boundingBox())!
    const scroll = page.getByTestId('sheet-scroll')
    const bounds = (await scroll.boundingBox())!
    const x = start.x + start.width / 2
    const y = start.y + start.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(direction === 'right' ? bounds.x + bounds.width - 2 : x,
      direction === 'down' ? bounds.y + bounds.height - 2 : y, { steps: 6 })
    await expect.poll(() => scroll.evaluate((node, direction) =>
      direction === 'down' ? node.scrollTop : node.scrollLeft, direction), { intervals: [16] }).toBeGreaterThan(200)
    // 滚动像素不等于引用行列；保持拖动直到草稿跨过目标，再松手检查最终值。
    const minimumEnd = direction === 'down' ? 25 : 8
    await expect.poll(referenceEnd).toBeGreaterThan(minimumEnd)
    await page.mouse.up()
    await expect(input).toBeFocused()
    const last = await referenceEnd()
    expect(last).toBeGreaterThan(minimumEnd)
    const expected = direction === 'down'
      ? Array.from({ length: last - 1 }, (_, index) => index % 24 + 1)
        .reduce((sum, value) => sum + value, 0)
      : last - 4
    await input.pressSequentially(')')
    await input.press('Enter')
    const target = await select(page, 'B2', '1:1')
    await expect(target).toHaveText(String(expected))
  })
}

test('F4 leaves a function name intact while allowing its referenced argument to change', async ({ page }) => {
  const target = await select(page, 'B2', '1:1')
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await input.fill('=LOG10(100)')
  await input.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(4, 4))
  await input.press('F4')
  await expect(input).toHaveValue('=LOG10(100)')
  await input.press('Enter')
  await expect(target).toHaveText('2')
})
