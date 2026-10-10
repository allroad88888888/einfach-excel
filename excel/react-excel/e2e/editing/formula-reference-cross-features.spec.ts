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

for (const direction of ['down', 'right'] as const) {
  test(`reference drag autoscrolls ${direction}, keeps input focus and calculates the full range`, async ({ page }) => {
    await select(page, 'B2', '1:1')
    const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await input.fill(direction === 'down' ? '=SUM(' : '=COUNTA(')
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
      direction === 'down' ? node.scrollTop : node.scrollLeft, direction)).toBeGreaterThan(200)
    await page.mouse.up()
    await expect(input).toBeFocused()
    const draft = await input.inputValue()
    let expected: number
    if (direction === 'down') {
      const match = /^=SUM\(E2:E(\d+)$/.exec(draft)
      expect(match).not.toBeNull()
      const last = Number(match![1])
      expect(last).toBeGreaterThan(25)
      expected = Array.from({ length: last - 1 }, (_, index) => index % 24 + 1)
        .reduce((sum, value) => sum + value, 0)
    } else {
      const match = /^=COUNTA\(E6:([A-Z]+)6$/.exec(draft)
      expect(match).not.toBeNull()
      const last = [...match![1]].reduce((col, ch) => col * 26 + ch.charCodeAt(0) - 64, 0)
      expect(last).toBeGreaterThan(8)
      expected = last - 4
    }
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
