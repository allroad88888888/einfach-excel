import { test, expect, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  cellInput,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
} from '../helpers'

/**
 * Cell editing session — keyboard entry/exit semantics on the real
 * worker backend, complementing vnext-direct-edit-real-backend.spec.ts
 * (which owns dblclick + Enter-commit + Escape-cancel).
 *
 * Intent contract (spreadsheet-ui-core/src/keyboard/index.ts):
 *  - printable char → `editing.start` with `clearOnStart` (overwrite)
 *  - F2            → `editing.start` preserving the existing content
 *  - Backspace     → `editing.start` with an empty draft
 *  - Delete        → `cell.clear`
 * Editor exit (SpreadsheetGrid.tsx editor onKeyDown/onBlur):
 *  - Tab commits and moves right, Shift+Enter commits and moves up,
 *    blur commits a drafting session.
 *
 * Worker demo seed (VNextWorkerDemo.tsx): B4 = 10 (number),
 * C4 = "source" (text); D6 is empty.
 */

async function gotoWorkerDemo(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

test.describe('editing session — keyboard entry and exit', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('typing a character overwrites the existing content', async ({ page }) => {
    await gotoWorkerDemo(page)
    await cell(page, 'B4').click()
    await expect(cell(page, 'B4')).toHaveAttribute('data-active', 'true')

    // Excel semantics: typing on a selected cell starts a FRESH draft —
    // the editor must hold exactly the typed char, not "10" + the char.
    await page.keyboard.press('5')
    const editor = cellInput(page, 'B4')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveValue('5')

    await page.keyboard.press('Enter')
    await expect(editor).toHaveCount(0)
    await expect(cellDisplay(page, 'B4')).toHaveText('5')
  })

  test('F2 enters edit mode preserving the full existing value', async ({ page }) => {
    await gotoWorkerDemo(page)
    await cell(page, 'C4').click()
    await expect(cell(page, 'C4')).toHaveAttribute('data-active', 'true')

    await page.keyboard.press('F2')
    const editor = cellInput(page, 'C4')
    await expect(editor).toBeVisible()
    // Contrast with the typed-char path: F2 keeps the current content.
    await expect(editor).toHaveValue('source')

    await page.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)
    await expect(cellDisplay(page, 'C4')).toHaveText('source')
  })

  test('blur commits the draft to the backend', async ({ page }) => {
    await gotoWorkerDemo(page)
    await cell(page, 'B4').dblclick()
    const editor = cellInput(page, 'B4')
    await expect(editor).toBeVisible()
    await editor.fill('77')

    // Clicking another cell blurs the editor → the drafting session
    // commits (non-formula draft, so no ref-pick interception).
    await cell(page, 'D6').click()
    await expect(editor).toHaveCount(0)
    await expect(cellDisplay(page, 'B4')).toHaveText('77')
  })

  test('Tab commits and moves the selection right', async ({ page }) => {
    await gotoWorkerDemo(page)
    await cell(page, 'B4').dblclick()
    const editor = cellInput(page, 'B4')
    await expect(editor).toBeVisible()
    await editor.fill('33')

    await page.keyboard.press('Tab')
    await expect(editor).toHaveCount(0)
    await expect(cellDisplay(page, 'B4')).toHaveText('33')
    await expect(cell(page, 'C4')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('status-mode-badge')).toHaveAttribute('data-mode', 'ready')
  })

  test('Shift+Enter commits and moves the selection up', async ({ page }) => {
    await gotoWorkerDemo(page)
    await cell(page, 'B4').dblclick()
    const editor = cellInput(page, 'B4')
    await expect(editor).toBeVisible()
    await editor.fill('8')

    await page.keyboard.press('Shift+Enter')
    await expect(editor).toHaveCount(0)
    await expect(cellDisplay(page, 'B4')).toHaveText('8')
    await expect(cell(page, 'B3')).toHaveAttribute('data-active', 'true')
  })

  test('Backspace opens an empty draft; Delete clears without editing', async ({ page }) => {
    await gotoWorkerDemo(page)

    // Backspace: edit session starts with an EMPTY draft over "source".
    await cell(page, 'C4').click()
    await page.keyboard.press('Backspace')
    const editor = cellInput(page, 'C4')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveValue('')
    await editor.fill('replaced')
    await page.keyboard.press('Enter')
    await expect(editor).toHaveCount(0)
    await expect(cellDisplay(page, 'C4')).toHaveText('replaced')

    // Delete: clears the value in place, never opening an editor.
    await cell(page, 'B4').click()
    await page.keyboard.press('Delete')
    await expect(cellInput(page, 'B4')).toHaveCount(0)
    await expect(cellDisplay(page, 'B4')).toHaveText('')
  })
})
