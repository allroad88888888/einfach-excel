import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, marker, editor, timeline, author, body, openComments,
  createComment, closeComments, reply, expectNeighbors } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

for (const width of [1280, 390]) test.describe(`${width}px comments`, () => {
  test.use({ viewport: { width, height: 850 } })

  test(`new comment retains author and local time through undo and redo at ${width}px`, async ({ page }) => {
    await createComment(page)
    await expect(button(page, 'Comments')).toBeFocused()
    await button(page, 'Undo').click(); await expect(marker(page, '1:0')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click(); await expect(marker(page, '1:0')).toHaveCount(1)
    await openComments(page)
    await expect(timeline(page)).toContainText('Alice')
    await expect(timeline(page)).toContainText('First line\n第二行🙂')
    const time = timeline(page).locator('time')
    const iso = await time.getAttribute('datetime')
    expect(Number.isFinite(Date.parse(iso!))).toBe(true)
    const displayed = await page.evaluate(value => new Intl.DateTimeFormat('en', {
      dateStyle: 'medium', timeStyle: 'short' }).format(Date.parse(value!)), iso)
    await expect(time).toHaveText(displayed)
    await closeComments(page); await expectNeighbors(page)
  })

  test(`view thread is read only and displays plain text at ${width}px`, async ({ page }) => {
    await createComment(page, 'A2', '1:0', '<img src=x onerror=alert(1)>\n第二行')
    await openComments(page)
    await expect(timeline(page)).toContainText('<img src=x onerror=alert(1)>')
    await expect(editor(page).locator('img,script')).toHaveCount(0)
    await closeComments(page)
    await button(page, 'Undo').click(); await expect(marker(page, '1:0')).toHaveCount(0)
    await expect(button(page, 'Undo')).toBeDisabled(); await expectNeighbors(page)
  })

  test(`post reply retains both authors and undo restores original thread at ${width}px`, async ({ page }) => {
    await createComment(page); await openComments(page); await reply(page)
    await expect(timeline(page).locator('li')).toHaveCount(2)
    await expect(timeline(page)).toContainText('Alice'); await expect(timeline(page)).toContainText('Bob')
    await closeComments(page); await button(page, 'Undo').click(); await openComments(page)
    await expect(timeline(page).locator('li')).toHaveCount(1)
    await expect(timeline(page)).not.toContainText('Please review')
    await closeComments(page); await button(page, 'Redo').click(); await openComments(page)
    await expect(timeline(page)).toContainText('Please review')
    await closeComments(page); await expectNeighbors(page)
  })

  test(`resolve discussion records actor and prevents replies at ${width}px`, async ({ page }) => {
    await createComment(page); await openComments(page); await author(page).fill('Reviewer')
    await button(page, 'Resolve discussion').click()
    await expect(editor(page).locator('.comment-state')).toHaveText('Resolved')
    await expect(timeline(page)).toContainText('Reviewer')
    await expect(timeline(page)).toContainText('Resolved this discussion')
    await expect(body(page)).toBeDisabled(); await expect(button(page, 'Post reply')).toBeDisabled()
    await closeComments(page); await expect(marker(page, '1:0')).toHaveCount(1)
    await button(page, 'Undo').click(); await openComments(page)
    await expect(editor(page).locator('.comment-state')).toHaveText('Open discussion')
    await expect(body(page)).toBeEnabled()
    await closeComments(page); await expectNeighbors(page)
  })

  test(`reopen discussion appends history and permits a later reply at ${width}px`, async ({ page }) => {
    await createComment(page); await openComments(page); await author(page).fill('Reviewer')
    await button(page, 'Resolve discussion').click(); await expect(body(page)).toBeDisabled()
    await author(page).fill('Owner'); await button(page, 'Reopen discussion').click()
    await expect(timeline(page)).toContainText('Reopened this discussion')
    await expect(timeline(page)).toContainText('Owner')
    await expect(timeline(page).locator('li')).toHaveCount(3)
    await closeComments(page); await button(page, 'Undo').click(); await openComments(page)
    await expect(body(page)).toBeDisabled()
    await closeComments(page); await button(page, 'Redo').click(); await openComments(page)
    await reply(page, 'After reopening', 'Bob'); await expect(timeline(page).locator('li')).toHaveCount(4)
    await closeComments(page); await expectNeighbors(page)
  })

  test(`close comments discards a reply draft and restores trigger focus at ${width}px`, async ({ page }) => {
    await createComment(page); await openComments(page); await body(page).fill('discard')
    await closeComments(page); await expect(button(page, 'Comments')).toBeFocused()
    await openComments(page); await expect(body(page)).toHaveValue('')
    await expect(timeline(page).locator('li')).toHaveCount(1)
    await closeComments(page); await button(page, 'Undo').click()
    await expect(marker(page, '1:0')).toHaveCount(0); await expect(button(page, 'Undo')).toBeDisabled()
    await expectNeighbors(page)
  })

  test(`Escape dismisses a new discussion without saving at ${width}px`, async ({ page }) => {
    await select(page, 'A2', '1:0'); await openComments(page)
    await author(page).fill('Alice'); await body(page, false).fill('discard')
    await body(page, false).press('Escape')
    await expect(editor(page)).toHaveCount(0); await expect(button(page, 'Comments')).toBeFocused()
    await expect(marker(page, '1:0')).toHaveCount(0); await expect(button(page, 'Undo')).toBeDisabled()
    await expectNeighbors(page)
  })

  test(`comment dialog traps focus and fits viewport at ${width}px`, async ({ page }, testInfo) => {
    await select(page, 'A2', '1:0'); await openComments(page)
    await expect(author(page)).toBeFocused()
    await author(page).press('Shift+Tab'); await expect(button(page, 'New comment')).toBeFocused()
    await button(page, 'New comment').press('Tab'); await expect(author(page)).toBeFocused()
    const bounds = await editor(page).boundingBox()
    expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`comments-${width}.png`) })
    await author(page).press('Escape'); await expectNeighbors(page)
  })
})
