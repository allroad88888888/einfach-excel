import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

for (const [address, coord, display, input] of [
  ['P3', '2:15', '$125', '125.02'],
  ['O4', '3:14', '10.00%', '0.1'],
]) {
  test(`${address} edits the original number and retains it after Enter and blur`, async ({
    page,
  }) => {
    const cell = await select(page, address!, coord!)
    await expect(cell).toHaveText(display!)
    const formula = page.getByRole('textbox', { name: 'Active cell value' })
    await expect(formula).toHaveValue(input!)
    await cell.dblclick()
    const editor = page.getByRole('textbox', { name: 'Cell editor' })
    await expect(editor).toHaveValue(input!)
    await editor.press('Enter')
    await expect(editor).toBeHidden()
    await select(page, address!, coord!)
    await formula.focus()
    await page.getByRole('textbox', { name: 'Name box' }).focus()
    await expect(cell).toHaveText(display!)
    await select(page, 'A800', '799:0')
    await select(page, address!, coord!)
    await expect(formula).toHaveValue(input!)
    await page.getByRole('button', { name: 'Clear formatting', exact: true }).click()
    await expect(cell).toHaveText(input!)
  })
}

test('high precision numbers retain round-trip input text after General display rounding', async ({
  page,
}) => {
  const cell = await select(page, 'B10', '9:1')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  const original = '1.2345678901234567'
  await formula.fill(original)
  await formula.press('Enter')
  await expect(formula).toHaveValue(original)
  await cell.dblclick()
  await expect(page.getByRole('textbox', { name: 'Cell editor' })).toHaveValue(original)
  await page.getByRole('textbox', { name: 'Cell editor' }).press('Enter')
  await expect(page.getByRole('textbox', { name: 'Cell editor' })).toBeHidden()
  await select(page, 'B10', '9:1')
  await expect(formula).toHaveValue(original)
})

for (const source of ['cell', 'formula'] as const) {
  test(`${source} editing does not consume IME confirmation or cancellation keys`, async ({
    page,
  }) => {
    const cell = await select(page, 'B10', '9:1')
    if (source === 'cell') await cell.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value',
    })
    await input.fill('中文候选')
    const prevented = await input.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      const keys = [
        new KeyboardEvent('keydown', {
          key: 'Enter',
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
        new KeyboardEvent('keydown', {
          key: 'Escape',
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
        new KeyboardEvent('keydown', {
          key: 'Enter',
          keyCode: 229,
          bubbles: true,
          cancelable: true,
        }),
      ]
      keys.forEach((key) => element.dispatchEvent(key))
      element.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: '中文候选' }),
      )
      return keys.map((key) => key.defaultPrevented)
    })
    expect(prevented).toEqual([false, false, false])
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('中文候选')
    await input.press('Enter')
    await expect(cell).toHaveText('中文候选')
  })

  test(`${source} Alt+Enter inserts a newline at the caret and commits one multiline value`, async ({
    page,
  }) => {
    const cell = await select(page, 'B10', '9:1')
    const neighbourHeight = await page
      .locator('td[data-cell="10:1"]')
      .evaluate((element) => element.getBoundingClientRect().height)
    if (source === 'cell') await cell.dblclick()
    const input = page.getByRole('textbox', {
      name: source === 'cell' ? 'Cell editor' : 'Active cell value',
    })
    await input.fill('firstsecond')
    await input.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(5, 5))
    await input.press('Alt+Enter')
    await expect(input).toHaveValue('first\nsecond')
    await expect(input).toBeFocused()
    await input.press('Enter')
    await expect(cell).toHaveText('first\nsecond')
    await expect(cell).toHaveCSS('white-space', 'pre-wrap')
    expect(
      await cell.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThan(neighbourHeight)
    expect(
      await page
        .locator('td[data-cell="10:1"]')
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBe(neighbourHeight)
    await select(page, 'A800', '799:0')
    await select(page, 'B10', '9:1')
    await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(
      'first\nsecond',
    )
  })
}

test('multiline seed and editor remain readable on desktop and narrow screens', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const seed = await select(page, 'I3', '2:8')
  await expect(seed).toHaveText('Noah\nEast team')
  await expect(seed).toHaveCSS('white-space', 'pre-wrap')
  expect(await seed.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(
    28,
  )
  await seed.dblclick()
  await expect(page.getByRole('textbox', { name: 'Cell editor' })).toHaveValue('Noah\nEast team')
  await page.screenshot({ path: info.outputPath('multiline-desktop.png') })
  await page.getByRole('textbox', { name: 'Cell editor' }).press('Escape')
  await expect(page.getByRole('textbox', { name: 'Cell editor' })).toBeHidden()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await select(page, 'I3', '2:8')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.focus()
  expect(await formula.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
    true,
  )
  await page.screenshot({ path: info.outputPath('multiline-narrow.png') })
  expect(errors).toEqual([])
})
