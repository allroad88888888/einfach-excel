import { expect, test, type Page } from '@playwright/test'

const panel = (page: Page) => page.getByRole('dialog', { name: 'Find and replace' })
async function open(page: Page, query: string) {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.locator('[data-workbook-grid="true"]').focus()
  await page.keyboard.press('Control+f')
  await panel(page).getByRole('textbox', { name: 'Find what' }).fill(query)
}

test('find all pages through all 999 matches and a last-page click selects the final record', async ({
  page,
}) => {
  await open(page, 'SO-')
  await panel(page).getByRole('button', { name: 'Find all', exact: true }).click()
  const results = panel(page).getByRole('region', { name: 'All search results' })
  await expect(results.getByText('Results 1–100 of 999')).toBeVisible()
  await expect(results.locator('tbody tr')).toHaveCount(100)
  await results.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(results.getByText('Results 101–200 of 999')).toBeVisible()
  await results.getByRole('button', { name: 'Last page', exact: true }).click()
  await expect(results.getByText('Results 901–999 of 999')).toBeVisible()
  await expect(results.locator('tbody tr')).toHaveCount(99)
  await results
    .getByRole('button', { name: 'Go to Sales Orders!A1001, match 999', exact: true })
    .click()
  await expect(page.locator('.name-box')).toHaveValue('A1001')
  await panel(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('td[data-cell="1000:0"]')).toHaveText('SO-11000')
  await expect(page.locator('td[data-cell="1000:0"]')).toBeInViewport()
})

test('literal, wildcard and escaped queries use the same native seed with exact scope', async ({
  page,
}) => {
  await open(page, 'SKU-*')
  const dialog = panel(page)
  await dialog.getByRole('combobox', { name: 'Within' }).selectOption('workbook')
  await dialog.getByRole('button', { name: 'Find all', exact: true }).click()
  await expect(dialog.getByText('Results 1–1 of 1')).toBeVisible()
  await dialog.getByRole('checkbox', { name: 'Use wildcards' }).check()
  await dialog.getByRole('button', { name: 'Find all', exact: true }).click()
  await expect(dialog.getByText('Results 1–4 of 4')).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Find what' }).fill('SKU-???')
  await dialog.getByRole('button', { name: 'Find all', exact: true }).click()
  await expect(dialog.getByText('Results 1–2 of 2')).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Find what' }).fill('SKU-~*')
  await dialog.getByRole('button', { name: 'Find all', exact: true }).click()
  await expect(dialog.getByText('Results 1–1 of 1')).toBeVisible()
  await dialog.getByRole('button', { name: 'Go to Summary!C86, match 1', exact: true }).click()
  await expect(page.locator('.name-box')).toHaveValue('C86')
})

test('a wildcard list result replaces only that Unicode cell and remains one undoable mutation', async ({
  page,
}) => {
  await open(page, 'SKU-?')
  const dialog = panel(page)
  await dialog.getByRole('combobox', { name: 'Within' }).selectOption('workbook')
  await dialog.getByRole('checkbox', { name: 'Use wildcards' }).check()
  await dialog.getByRole('checkbox', { name: 'Match entire cell' }).check()
  await dialog.getByRole('button', { name: 'Find all', exact: true }).click()
  await expect(dialog.getByText('Results 1–2 of 2')).toBeVisible()
  await dialog.getByRole('button', { name: 'Go to Summary!A87, match 2', exact: true }).click()
  await dialog.getByRole('tab', { name: 'Replace', exact: true }).click()
  await dialog.getByRole('textbox', { name: 'Replace with' }).fill('SKU-X')
  await dialog.getByRole('button', { name: 'Replace current', exact: true }).click()
  await expect(dialog.getByText(/Replaced 1 occurrence/)).toBeVisible()
  await expect(dialog.getByRole('region', { name: 'All search results' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('td[data-cell="86:0"]')).toHaveText('SKU-X')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('td[data-cell="86:0"]')).toHaveText('SKU-😀')
  await expect(page.locator('td[data-cell="85:2"]')).toHaveText('SKU-*')
})

for (const width of [1280, 390]) {
  test(`result list fits ${width}px and remains keyboard navigable`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    await open(page, 'SKU-*')
    const dialog = panel(page)
    await dialog.getByRole('combobox', { name: 'Within' }).selectOption('workbook')
    await dialog.getByRole('checkbox', { name: 'Use wildcards' }).check()
    await dialog.getByRole('button', { name: 'Find all', exact: true }).click()
    const target = dialog.getByRole('button', { name: 'Go to Summary!A87, match 4', exact: true })
    await target.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.name-box')).toHaveValue('A87')
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    )
    await target.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`find-results-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
  })
}
