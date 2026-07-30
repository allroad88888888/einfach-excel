import { test, expect, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
  selectSheet,
  typeIntoCell,
} from '../helpers'

/**
 * User-observable face of the requestId/revision stale-request contract
 * (excel/spreadsheet-ui-core/src/backend/types.ts): mutations and
 * projection reads carry requestId/revision so the worker adapter can drop
 * responses computed against an outdated workbook state. A UI that applied
 * stale responses out of order would flash an OLD value AFTER a newer one
 * had already rendered, or paint a stale sheet's cells after a switch.
 *
 * Per plan §5 these specs assert product-visible results only — the
 * MutationObserver below records the visible DOM text of a cell, not any
 * internal state; `?debug=1` probes stay in perf-virtual/.
 *
 * Seeds (VNextWorkerDemo): Sheet1!C2 = =Sheet2!C2+1, Sheet2!C2 = =Sheet3!C2+1,
 * Sheet3!C2 = =Sheet1!B4+1 ⇒ Sheet1!C2 = B4 + 3 (B4 = 10 → C2 = 13).
 */

type ObserverWindow = Window & { __einfachCellTextLog?: string[] }

async function gotoWorkerDemo(page: Page) {
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

async function observeCellText(page: Page, addr: string) {
  await page.evaluate((cellAddr) => {
    const win = window as unknown as ObserverWindow
    const target = document.querySelector(`td.cell[data-cell-addr="${cellAddr}"]`)
    if (!target) throw new Error(`cell ${cellAddr} is not mounted`)
    const log: string[] = [(target.textContent ?? '').trim()]
    win.__einfachCellTextLog = log
    const observer = new MutationObserver(() => {
      const text = (target.textContent ?? '').trim()
      if (log[log.length - 1] !== text) log.push(text)
    })
    observer.observe(target, { subtree: true, childList: true, characterData: true })
  }, addr)
}

async function observedCellText(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as ObserverWindow).__einfachCellTextLog ?? [])
}

test.describe('vNext worker backend — stale-request consistency (user-observable)', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('rapid consecutive edits settle on the final value with no stale flash-back', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await observeCellText(page, 'C2')

    // Five commits in quick succession — each Enter resolves as soon as the
    // edit input unmounts, so the worker sees overlapping refresh rounds.
    for (const value of ['11', '12', '13', '14', '15']) {
      await typeIntoCell(page, 'B4', value)
    }

    // Final consistency: C2 = B4 + 3 through the 3-sheet chain.
    await expect(cellDisplay(page, 'C2')).toHaveText('18')
    await expect(cellDisplay(page, 'B4')).toHaveText('15')

    // No stale flash-back: every observed numeric repaint of C2 must be
    // monotonically non-decreasing (13 → … → 18). A stale response applied
    // late would paint an older (smaller) value after a newer one.
    const observed = (await observedCellText(page))
      .filter((text) => /^\d+$/.test(text))
      .map(Number)
    expect(observed.length).toBeGreaterThan(0)
    expect(observed[observed.length - 1]).toBe(18)
    expect(observed).toEqual([...observed].sort((a, b) => a - b))

    // The formula bar agrees with the last committed edit.
    await cell(page, 'B4').click()
    await expect(page.getByTestId('formula-bar-input')).toHaveValue('15')
    await expectNoConsoleErrors(page)
  })

  test('rapid sheet switching settles on the last selected sheet without stale bleed', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    const tabs = page.getByTestId('vnext-worker-sheet-tabs')

    // Fire four activations without waiting for projections in between —
    // three visible-window rounds become stale mid-flight.
    await tabs.getByRole('tab', { name: 'Sheet2', exact: true }).click()
    await tabs.getByRole('tab', { name: 'Sheet3', exact: true }).click()
    await tabs.getByRole('tab', { name: 'Sheet2', exact: true }).click()
    await tabs.getByRole('tab', { name: 'Sheet1', exact: true }).click()

    // The settled window must belong to Sheet1 wholesale — a stale
    // response from the Sheet2/Sheet3 rounds must not repaint any cell.
    await expect(tabs.getByRole('tab', { name: 'Sheet1', exact: true })).toHaveAttribute(
      'data-active',
      'true',
    )
    await expect(cellDisplay(page, 'A1')).toHaveText('Sheet1')
    await expect(cellDisplay(page, 'A2')).toHaveText('cell1')
    await expect(cellDisplay(page, 'C2')).toHaveText('13')
    await expect(cellDisplay(page, 'B4')).toHaveText('10')

    // One deliberate switch after the storm still lands cleanly.
    await selectSheet(page, 'Sheet3')
    await expect(cellDisplay(page, 'A1')).toHaveText('Sheet3')
    await expect(cellDisplay(page, 'C2')).toHaveText('11')
    await expect(cellDisplay(page, 'B4')).toHaveText('100')
    await expectNoConsoleErrors(page)
  })
})
