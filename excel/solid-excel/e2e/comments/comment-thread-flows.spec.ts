import { expect, test, type Page } from '@playwright/test'
import { cell, expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

/**
 * CM-05..CM-08 (CASES.md): comment-thread session lifecycle on the Wave
 * 5 static demo, pinned AS IMPLEMENTED:
 *
 * - The session anchor is snapshotted when the toolbar button opens the
 *   thread; moving the grid selection afterwards does NOT re-anchor it.
 *   Only pressing the comment button again replaces the session.
 * - Every session replacement (open after close, re-open on another
 *   cell) resets the draft to '' (`replaceCommentSessionAtom`).
 * - No demo backend implements the `postComment` port, so Post follows
 *   the fail-closed contract: a role=alert error surfaces and nothing
 *   pretends to be posted. (The missing-port gate fires BEFORE the
 *   empty-draft gate in `reserveCommentMutationLaunchAtom`, so the
 *   empty-draft message is unreachable on these demos — see CASES.md
 *   CM-07.)
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

function thread(page: Page) {
  return page.getByTestId('wave5-comment-thread')
}

function threadCellLabel(page: Page) {
  return thread(page).getByTestId('comment-thread-cell')
}

function textarea(page: Page) {
  return thread(page).getByTestId('comment-thread-textarea')
}

async function openThreadAt(page: Page, addr: string) {
  await cell(page, addr).click()
  await expect(cell(page, addr)).toHaveAttribute('data-active', 'true')
  await page.getByTestId('toolbar-btn-comment').click()
  await expect(thread(page)).toBeVisible()
}

test.describe('Comment thread — session lifecycle and fail-closed post', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Escape closes the thread and reopening starts with an empty draft', async ({ page }) => {
    await gotoWave5(page)
    await openThreadAt(page, 'D4')

    await textarea(page).fill('draft that must not survive the session')
    await expect(textarea(page)).toHaveValue('draft that must not survive the session')

    await page.keyboard.press('Escape')
    await expect(thread(page)).toHaveCount(0)

    // Reopening on the same cell rotates the session → draft is reset.
    await openThreadAt(page, 'D4')
    await expect(textarea(page)).toHaveValue('')
    await expect(threadCellLabel(page)).toContainText('D4')
  })

  test('thread stays anchored while the selection moves; the button re-anchors it', async ({
    page,
  }) => {
    await gotoWave5(page)
    await openThreadAt(page, 'D4')
    await expect(threadCellLabel(page)).toContainText('D4')
    await textarea(page).fill('anchored draft')

    // Moving the grid selection does not move the open thread.
    await cell(page, 'F6').click()
    await expect(cell(page, 'F6')).toHaveAttribute('data-active', 'true')
    await expect(thread(page)).toBeVisible()
    await expect(threadCellLabel(page)).toContainText('D4')
    await expect(textarea(page)).toHaveValue('anchored draft')

    // Pressing the comment button again replaces the session: new anchor,
    // draft reset.
    await page.getByTestId('toolbar-btn-comment').click()
    await expect(threadCellLabel(page)).toContainText('F6')
    await expect(textarea(page)).toHaveValue('')
  })

  test('posting on a backend without a comment port fails closed with an alert', async ({
    page,
  }) => {
    await gotoWave5(page)
    await openThreadAt(page, 'C3')

    await textarea(page).fill('this backend cannot store me')
    await thread(page).getByTestId('comment-post-button').click()

    const error = thread(page).getByTestId('comment-mutation-error')
    await expect(error).toBeVisible()
    await expect(error).toHaveText('Comment post is unavailable')

    // Fail-closed: nothing pretends success — the thread stays open with
    // the draft intact, and no resolve control appears (no threadId).
    await expect(thread(page)).toBeVisible()
    await expect(textarea(page)).toHaveValue('this backend cannot store me')
    await expect(thread(page).getByTestId('comment-resolve-button')).toHaveCount(0)
  })
})
