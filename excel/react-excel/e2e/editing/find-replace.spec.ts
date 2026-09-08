import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Find and replace' })
async function select(page: Page, address: string) {
  const box = page.getByRole('textbox', { name: 'Name box' })
  await box.fill(address)
  await box.press('Enter')
  await expect(box).toHaveValue(address)
}
async function open(page: Page, needle: string, replacing = false) {
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await expect(dialog(page)).toBeVisible()
  if (replacing) await dialog(page).getByRole('tab', { name: 'Replace', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Find what' }).fill(needle)
}
async function close(page: Page) {
  await dialog(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
}
async function summary(page: Page) {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('workbook find navigates offscreen into Summary and previous/next wrap exact occurrences', async ({
  page,
}) => {
  await open(page, 'alpha')
  await dialog(page).getByRole('combobox', { name: 'Within' }).selectOption('workbook')
  await dialog(page).getByRole('button', { name: 'Find next' }).click()
  await expect(dialog(page).getByText('1 of 4 · Summary!A85')).toBeVisible()
  await expect(page.locator('.name-box')).toHaveValue('A85')
  await dialog(page).getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(dialog(page).getByText('4 of 4 · Summary!C85')).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Find next' }).click()
  await expect(dialog(page).getByText('1 of 4 · Summary!A85')).toBeVisible()
  await close(page)
  await expect(cell(page, '84:0')).toHaveText('😀alpha alpha')
  await expect(cell(page, '84:0')).toBeInViewport()
  await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
})

test('current replacement changes only the chosen Unicode occurrence and undo restores it', async ({
  page,
}) => {
  await summary(page)
  await open(page, 'alpha', true)
  await dialog(page).getByRole('button', { name: 'Find next' }).click()
  await dialog(page).getByRole('button', { name: 'Find next' }).click()
  await expect(dialog(page).getByText('2 of 4 · Summary!A85')).toBeVisible()
  await dialog(page).getByRole('textbox', { name: 'Replace with' }).fill('beta')
  await dialog(page).getByRole('button', { name: 'Replace current', exact: true }).click()
  await expect(dialog(page).getByText(/Replaced 1 occurrence\(s\) in 1 cell/)).toBeVisible()
  await expect(
    dialog(page).getByRole('button', { name: 'Replace current', exact: true }),
  ).toBeDisabled()
  await close(page)
  await expect(cell(page, '84:0')).toHaveText('😀alpha beta')
  await expect(cell(page, '84:1')).toHaveText('ALPHA')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '84:0')).toHaveText('😀alpha alpha')
})

test('replace all changes every matching order beyond 500 and is one undoable operation', async ({
  page,
}) => {
  await open(page, 'SO-', true)
  await dialog(page).getByRole('textbox', { name: 'Replace with' }).fill('INV-')
  await dialog(page).getByRole('button', { name: 'Replace all', exact: true }).click()
  await expect(dialog(page).getByText(/Replaced 999 occurrence\(s\) in 999 cell/)).toBeVisible()
  await close(page)
  await expect(cell(page, '1:0')).toHaveText('INV-10001')
  await select(page, 'A1001')
  await expect(cell(page, '1000:0')).toHaveText('INV-11000')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await select(page, 'A1001')
  await expect(cell(page, '1000:0')).toHaveText('SO-11000')
  await select(page, 'A2')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(page, '1:0')).toHaveText('INV-10001')
})

test('original selection and case/whole-cell options stay stable after navigation', async ({
  page,
}) => {
  await summary(page)
  await select(page, 'A85:B85')
  await open(page, 'alpha')
  await dialog(page).getByRole('combobox', { name: 'Within' }).selectOption('current-selection')
  await dialog(page).getByRole('checkbox', { name: 'Match case', exact: true }).check()
  await dialog(page).getByRole('button', { name: 'Find next' }).click()
  await expect(dialog(page).getByText('1 of 2 · Summary!A85')).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Find next' }).click()
  await expect(dialog(page).getByText('2 of 2 · Summary!A85')).toBeVisible()
  await dialog(page).getByRole('checkbox', { name: 'Match case', exact: true }).uncheck()
  await dialog(page).getByRole('checkbox', { name: 'Match entire cell', exact: true }).check()
  await dialog(page).getByRole('button', { name: 'Find next' }).click()
  await expect(dialog(page).getByText('1 of 1 · Summary!B85')).toBeVisible()
})

test('failed formula replacement rolls back the earlier text cells and can be corrected', async ({
  page,
}) => {
  await summary(page)
  await open(page, 'alpha', true)
  await dialog(page).getByRole('textbox', { name: 'Replace with' }).fill('"')
  await dialog(page).getByRole('button', { name: 'Replace all', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText('INVALID_FORMULA')
  await dialog(page).getByRole('textbox', { name: 'Replace with' }).fill('beta')
  await dialog(page).getByRole('button', { name: 'Replace all', exact: true }).click()
  await expect(dialog(page).getByText(/Replaced 4 occurrence\(s\) in 3 cell/)).toBeVisible()
  await close(page)
  await select(page, 'A85')
  await expect(cell(page, '84:0')).toHaveText('😀beta beta')
  await expect(cell(page, '84:2')).toHaveText('4')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '84:0')).toHaveText('😀alpha alpha')
  await expect(cell(page, '84:2')).toHaveText('5')
})

test('displayed-value search locates a formula result but replacement preserves its source', async ({
  page,
}) => {
  await summary(page)
  await select(page, 'C85')
  await open(page, '5', true)
  await dialog(page).getByRole('combobox', { name: 'Within' }).selectOption('current-selection')
  await dialog(page).getByRole('combobox', { name: 'Look in' }).selectOption('values')
  await dialog(page).getByRole('button', { name: 'Find next' }).click()
  await expect(dialog(page).getByText('1 of 1 · Summary!C85')).toBeVisible()
  await dialog(page).getByRole('textbox', { name: 'Replace with' }).fill('6')
  await dialog(page).getByRole('button', { name: 'Replace current', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('Choose Formulas')
  await close(page)
  await expect(cell(page, '84:2')).toHaveText('5')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue(
    '=LEN("alpha")',
  )
})

for (const modifier of ['Control', 'Meta']) {
  test(`${modifier}+F/H opens the scoped panel, Escape restores grid focus, and no-match is visible`, async ({
    page,
  }) => {
    await page.locator('[data-workbook-grid="true"]').focus()
    await page.keyboard.press(`${modifier}+f`)
    await expect(dialog(page).getByRole('textbox', { name: 'Find what' })).toBeFocused()
    await dialog(page).getByRole('textbox', { name: 'Find what' }).fill('not-present-92837')
    await dialog(page).getByRole('button', { name: 'Find next' }).click()
    await expect(dialog(page).getByText('No matches found.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
    await page.keyboard.press(`${modifier}+h`)
    await expect(dialog(page).getByRole('textbox', { name: 'Replace with' })).toBeVisible()
  })
}
