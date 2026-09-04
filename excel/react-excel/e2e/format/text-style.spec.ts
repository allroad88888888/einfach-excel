import { expect, test, type Page } from '@playwright/test'

interface TextStyleCase {
  readonly label: 'Bold' | 'Italic' | 'Underline' | 'Strikethrough'
  readonly active: (page: Page) => Promise<string>
  readonly enabledValue: string
  readonly disabledValue: string
}

const cases: readonly TextStyleCase[] = [
  {
    label: 'Bold',
    active: (page) => cellStyle(page, 'fontWeight'),
    enabledValue: '700',
    disabledValue: '400',
  },
  {
    label: 'Italic',
    active: (page) => cellStyle(page, 'fontStyle'),
    enabledValue: 'italic',
    disabledValue: 'normal',
  },
  {
    label: 'Underline',
    active: (page) => cellStyle(page, 'textDecorationLine'),
    enabledValue: 'underline',
    disabledValue: 'none',
  },
  {
    label: 'Strikethrough',
    active: (page) => cellStyle(page, 'textDecorationLine'),
    enabledValue: 'line-through',
    disabledValue: 'none',
  },
]

function cellStyle(page: Page, property: keyof CSSStyleDeclaration): Promise<string> {
  return page.locator('td[data-cell="0:0"]').evaluate(
    (cell, styleProperty) => getComputedStyle(cell)[styleProperty] as string,
    property,
  )
}

for (const styleCase of cases) {
  test(`${styleCase.label} toggles the selected Rust cell style`, async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto('/')
    const cell = page.locator('td[data-cell="0:0"]')
    const button = page.getByRole('button', { name: styleCase.label })
    await expect(cell).toBeVisible()
    await cell.click()

    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => styleCase.active(page)).toBe(styleCase.enabledValue)

    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => styleCase.active(page)).toBe(styleCase.disabledValue)
    expect(consoleErrors).toEqual([])
  })
}

test('shows the text styles from the original Rust seed', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveCSS('font-weight', '700')
  await expect(page.locator('td[data-cell="1:1"]')).toHaveCSS('font-style', 'italic')
  await expect(page.locator('td[data-cell="1:2"]')).toHaveCSS(
    'text-decoration-line',
    'underline',
  )
  const nameBox = page.getByRole('textbox', { name: 'Name box' })
  await nameBox.fill('M2')
  await nameBox.press('Enter')
  await expect(page.locator('td[data-cell="1:12"]')).toHaveCSS(
    'text-decoration-line',
    'line-through',
  )
})
