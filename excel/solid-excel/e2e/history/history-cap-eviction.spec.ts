import { test, expect, type Page } from '@playwright/test'
import { cell, cellDisplay, guardConsoleErrors, typeIntoCell, withEnglishLocale } from '../helpers'

/**
 * DEFAULT_HISTORY_CAP (= 100) eviction on the Wave 5 static demo
 * (excel/spreadsheet-ui-core/src/history/index.ts::appendHistoryEntry:
 * `next.slice(next.length - DEFAULT_HISTORY_CAP)` keeps the NEWEST 100).
 *
 * The 101st push must evict the OLDEST entry: the stack stays at 100 and
 * the very first operation becomes unreachable — draining every undo
 * leaves its effect in place.
 *
 * Build strategy: 1 value edit (`cell.set-input`) followed by 100 toolbar
 * Bold toggles (`format.set`) on a single cell — the cheapest recorded
 * operation available (one click each). The per-click cursor assertion
 * keeps the build deterministic: a click swallowed while the previous
 * mutation is still in flight would stall the expected "n / n" text and
 * fail here rather than corrupting the final count.
 *
 * The static backend's own transaction log holds 200 entries
 * (STATIC_BACKEND_UNDO_CAP), so all 100 surviving UI entries stay
 * replayable during the drain.
 *
 * Cost (CASES.md HI-09): ~201 awaited UI operations — ~12s measured
 * locally on the wasm project; the 240s timeout is headroom for slow CI
 * runners. If CI still cannot absorb it, downgrade this scenario to ⏳
 * rather than shrinking the cap assertion.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

test.describe('history cap — 100-entry eviction', () => {
  test.setTimeout(240_000)

  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('the 101st entry evicts the oldest; the evicted edit survives a full undo drain', async ({
    page,
  }) => {
    await gotoWave5(page)

    const cursor = page.getByTestId('history-timeline-cursor')
    const entry0 = page.getByTestId('history-timeline-entry-0')
    await expect(cursor).toHaveText('0 / 0')

    // Entry #1 — a value edit. This is the entry the cap must evict.
    await typeIntoCell(page, 'A8', 'first')
    await expect(cellDisplay(page, 'A8')).toHaveText('first')
    await expect(cursor).toHaveText('1 / 1')
    await expect(entry0).toHaveAttribute('data-kind', 'cell.set-input')

    // Entries #2..#101 — 100 Bold toggles on B8, each recording format.set.
    await cell(page, 'B8').click()
    const boldBtn = page.getByTestId('toolbar-btn-bold')
    for (let i = 1; i <= 100; i++) {
      await boldBtn.click()
      const depth = Math.min(1 + i, 100)
      await expect(cursor).toHaveText(`${depth} / ${depth}`)
    }

    // Cap witness: 101 pushes, 100 kept. Slot 0 no longer holds the value
    // edit, there is no 101st slot, and the set-input kind is gone entirely.
    await expect(cursor).toHaveText('100 / 100')
    await expect(entry0).toHaveAttribute('data-kind', 'format.set')
    await expect(page.getByTestId('history-timeline-entry-99')).toHaveAttribute(
      'data-kind',
      'format.set',
    )
    await expect(page.getByTestId('history-timeline-entry-100')).toHaveCount(0)
    await expect(page.getByTestId('history-timeline-list')).not.toContainText('cell.set-input')

    // Behavioral proof: drain all 100 undos. The evicted first edit must NOT
    // revert — A8 keeps its value while the whole visible stack unwinds.
    const undoBtn = page.getByTestId('history-timeline-undo')
    for (let i = 1; i <= 100; i++) {
      await undoBtn.click()
      await expect(cursor).toHaveText(`${100 - i} / 100`)
    }
    await expect(undoBtn).toBeDisabled()
    await expect(cellDisplay(page, 'A8')).toHaveText('first')
  })
})
