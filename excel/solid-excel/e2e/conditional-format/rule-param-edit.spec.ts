import { expect, test, type Page } from '@playwright/test'
import { cell, expectNoConsoleErrors, gotoRoot, guardConsoleErrors, typeIntoCell } from '../helpers'

async function gotoWorkerDemo(page: Page) {
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'C2')).toContainText('13', { timeout: 30_000 })
}

function dialog(page: Page) {
  return page.getByTestId('vnext-worker-conditional-format')
}

async function openDialog(page: Page) {
  await page.getByTestId('toolbar-btn-conditional-format').click()
  await expect(dialog(page)).toBeVisible()
}

function ruleEntries(page: Page) {
  return dialog(page).locator('[data-testid^="cf-rule-entry-"]')
}

test.describe('Conditional-format rule parameter editing — real Worker backends', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('editing a persisted rule updates it in place and re-projects through TS and WASM workers', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    expect(['ts', 'wasm']).toContain(test.info().project.name)

    // Install the default cell-value rule (gt / 0) scoped to B2.
    await typeIntoCell(page, 'B2', '50')
    await cell(page, 'B2').click()
    await openDialog(page)
    await dialog(page).getByTestId('cf-save-button').click()
    await expect(dialog(page)).toBeHidden()
    await expect(cell(page, 'B2')).toHaveAttribute('data-has-conditional-format', 'true')

    // Reopen: the persisted rule hydrates the list, selecting it hydrates the draft.
    await openDialog(page)
    await expect(ruleEntries(page)).toHaveCount(1, { timeout: 15_000 })
    await ruleEntries(page).first().click()
    await expect(ruleEntries(page).first()).toHaveAttribute('aria-current', 'true')
    await expect(dialog(page).getByTestId('cf-cell-operator')).toHaveValue('gt')
    await expect(dialog(page).getByTestId('cf-cell-value')).toHaveValue('0')

    // Edit condition, threshold, and background, then save.
    await dialog(page).getByTestId('cf-cell-operator').selectOption('lt')
    await dialog(page).getByTestId('cf-cell-value').fill('10')
    await dialog(page).getByTestId('cf-cell-background').fill('#38bdf8')
    await dialog(page).getByTestId('cf-save-button').click()
    await expect(dialog(page)).toBeHidden()

    // 50 < 10 fails → the edit must have REPLACED the gt/0 rule, not appended
    // beside it (a leftover gt/0 rule would keep this attribute true).
    await expect(cell(page, 'B2')).toHaveAttribute('data-has-conditional-format', 'false')

    // 5 < 10 hits → projection paints the edited background.
    await typeIntoCell(page, 'B2', '5')
    await expect(cell(page, 'B2')).toHaveAttribute('data-has-conditional-format', 'true')
    await expect(cell(page, 'B2')).toHaveCSS('background-color', 'rgb(56, 189, 248)')

    // Reopen: still exactly one rule, carrying the edited parameters.
    await openDialog(page)
    await expect(ruleEntries(page)).toHaveCount(1, { timeout: 15_000 })
    await ruleEntries(page).first().click()
    await expect(dialog(page).getByTestId('cf-cell-operator')).toHaveValue('lt')
    await expect(dialog(page).getByTestId('cf-cell-value')).toHaveValue('10')
    await expect(dialog(page).getByTestId('cf-cell-background')).toHaveValue('#38bdf8')
  })
})
