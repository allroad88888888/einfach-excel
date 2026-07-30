import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  cellInput,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
} from '../helpers'

/**
 * PR-02 / PR-03 (CASES.md): the unlock-range flow on the vNext Worker
 * demo. Protection is UI-core canonical — the worker runtimes expose no
 * protection port, yet the whole protect → unlock-range → edit → cancel
 * cycle works locally on both real backends.
 *
 * The demos pass no `verifySheetProtection` port, so Unlock commits
 * without a password check; the typed password is transient session
 * state cleared on every open (PR-06 stays P2 until a verifier exists).
 */

async function gotoWorkerDemo(page: Page) {
  await gotoRoot(page, 'locale=en')
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

async function clickFormatMenuItem(page: Page, itemId: string) {
  await page.getByTestId('menu-bar-button-format').click()
  await expect(page.getByTestId('menu-bar-dropdown-format')).toBeVisible()
  await page.getByTestId(`menu-bar-item-${itemId}`).click()
  await expect(page.getByTestId('menu-bar-dropdown-format')).toHaveCount(0)
}

function unlockDialog(page: Page) {
  return page.getByTestId('vnext-worker-protection-unlock')
}

/** Double-click must NOT open the editor (the locked-cell block signal). */
async function expectEditBlocked(page: Page, addr: string) {
  await cell(page, addr).dblclick()
  await expect(cell(page, addr)).toHaveAttribute('data-active', 'true')
  await expect(cellInput(page, addr)).toHaveCount(0)
}

test.describe('vNext protection — unlock-range on the real worker backend', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('unlocked range is editable while the rest of the sheet stays blocked', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)

    await clickFormatMenuItem(page, 'format.protectSheet')
    await expectEditBlocked(page, 'B4')

    // Unlock exactly B4 (the current selection when the menu item fires).
    await cell(page, 'B4').click()
    await clickFormatMenuItem(page, 'format.unlockRange')
    await expect(unlockDialog(page)).toBeVisible()
    await expect(unlockDialog(page).getByTestId('protection-unlock-target')).toHaveText(
      'Worksheet sheet-1, rows 4–4, columns 2–2',
    )
    await unlockDialog(page).getByTestId('protection-unlock-confirm').click()
    await expect(unlockDialog(page)).toHaveCount(0)

    // Inside the unlocked range: editing works and commits.
    await cell(page, 'B4').dblclick()
    const editor = cellInput(page, 'B4')
    await expect(editor).toBeVisible()
    await editor.fill('77')
    await editor.press('Enter')
    await expect(editor).toHaveCount(0)
    await expect(cellDisplay(page, 'B4')).toHaveText('77')

    // Outside the unlocked range the sheet is still protected.
    await expectEditBlocked(page, 'A4')

    // Unprotect restores editing everywhere.
    await clickFormatMenuItem(page, 'format.unprotectSheet')
    await cell(page, 'A4').dblclick()
    await expect(cellInput(page, 'A4')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cellInput(page, 'A4')).toHaveCount(0)
  })

  test('cancelling the unlock dialog keeps the lock; reopening clears the password', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)

    await clickFormatMenuItem(page, 'format.protectSheet')
    await cell(page, 'A4').click()
    await clickFormatMenuItem(page, 'format.unlockRange')
    await expect(unlockDialog(page)).toBeVisible()

    const password = unlockDialog(page).getByTestId('protection-unlock-password')
    await password.fill('secret')
    await expect(password).toHaveValue('secret')

    // Escape cancels: no unlock is committed, the cell stays blocked.
    await page.keyboard.press('Escape')
    await expect(unlockDialog(page)).toHaveCount(0)
    await expectEditBlocked(page, 'A4')

    // Reopening starts a fresh session: the password never persists.
    await clickFormatMenuItem(page, 'format.unlockRange')
    await expect(unlockDialog(page)).toBeVisible()
    await expect(unlockDialog(page).getByTestId('protection-unlock-password')).toHaveValue('')

    // Confirm (no verifier wired) commits the unlock locally.
    await unlockDialog(page).getByTestId('protection-unlock-confirm').click()
    await expect(unlockDialog(page)).toHaveCount(0)
    await cell(page, 'A4').dblclick()
    await expect(cellInput(page, 'A4')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cellInput(page, 'A4')).toHaveCount(0)
  })
})
