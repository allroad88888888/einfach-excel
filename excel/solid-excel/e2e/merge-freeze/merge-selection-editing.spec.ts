import { expect, test, type Page } from '@playwright/test'
import { cell, cellDisplay, cellInput, guardConsoleErrors, withEnglishLocale } from '../helpers'

/**
 * Merge-region interaction on the Wave 5 static demo (CASES.md MF-09/10/11).
 *
 * The merge commands themselves are covered by toolbar-merge.spec.ts; these
 * cases pin the interaction contract of an EXISTING merged region: how clicks
 * shape the selection, where editing lands, and how the active cell treats
 * the covered coordinates.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  // Wait for the seeded projection so clicks land on hydrated cells.
  await expect(cellDisplay(page, 'B2')).toHaveText('120')
}

/** Merge B2:C3 through the toolbar dropdown (seeded values, anchor keeps 120). */
async function mergeB2C3(page: Page) {
  await cell(page, 'B2').click()
  await cell(page, 'C3').click({ modifiers: ['Shift'] })
  await page.getByTestId('toolbar-btn-merge').click()
  await expect(page.getByTestId('toolbar-merge-dropdown')).toBeVisible()
  await page.getByTestId('toolbar-merge-center').click()
  await expect(page.getByTestId('toolbar-merge-dropdown')).toBeHidden()
  await expect(cell(page, 'B2')).toHaveAttribute('data-merge-anchor', 'true')
  await expect(cell(page, 'B2')).toHaveAttribute('rowspan', '2')
  await expect(cell(page, 'B2')).toHaveAttribute('colspan', '2')
}

function addrBox(page: Page) {
  return page.getByTestId('formula-bar-addr')
}

test.describe('Wave 5 merge region interaction', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('clicking the merged anchor snaps the selection to the whole region and Shift+click extends from it', async ({
    page,
  }) => {
    await gotoWave5(page)
    await mergeB2C3(page)

    // Park the selection elsewhere first so the next click is what shapes it.
    await cell(page, 'E5').click()
    await expect(cell(page, 'E5')).toHaveAttribute('data-active', 'true')

    // Clicking the anchor selects exactly the merged rect — nothing outside.
    await cell(page, 'B2').click()
    await expect(cell(page, 'B2')).toHaveClass(/is-selected/)
    await expect(cell(page, 'E5')).not.toHaveClass(/is-selected/)
    await expect(cell(page, 'D2')).not.toHaveClass(/is-selected/)
    await expect(cell(page, 'B4')).not.toHaveClass(/is-selected/)

    // Shift+click extends from the merge's TOP-LEFT anchor (not the
    // bottom-right), so the rect is B2:D4 — pinned by the copy-as HTML
    // encoder contract (`createSelectionForRange` in SpreadsheetGrid.tsx).
    await cell(page, 'D4').click({ modifiers: ['Shift'] })
    for (const target of ['B2', 'D2', 'D3', 'B4', 'C4', 'D4']) {
      await expect(cell(page, target)).toHaveClass(/is-selected/)
    }
    await expect(cell(page, 'D4')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'E5')).not.toHaveClass(/is-selected/)
    await expect(cell(page, 'E2')).not.toHaveClass(/is-selected/)
  })

  test('double-clicking the merged anchor edits in place and the commit lands on the anchor', async ({
    page,
  }) => {
    await gotoWave5(page)
    await mergeB2C3(page)

    // The editor mounts inside the anchor td (the only td of the region).
    await cell(page, 'B2').dblclick()
    const input = cellInput(page, 'B2')
    await expect(input).toBeVisible()
    await input.fill('edited-anchor')
    await input.press('Enter')
    await expect(input).toHaveCount(0)

    // The committed value renders at the anchor and the merge survives.
    await expect(cellDisplay(page, 'B2')).toHaveText('edited-anchor')
    await expect(cell(page, 'B2')).toHaveAttribute('data-merge-anchor', 'true')
    await expect(cell(page, 'B2')).toHaveAttribute('rowspan', '2')
    await expect(cell(page, 'B2')).toHaveAttribute('colspan', '2')

    // Unmerge afterwards: the value stays on the anchor cell only.
    await cell(page, 'B2').click()
    await page.getByTestId('toolbar-btn-merge').click()
    await page.getByTestId('toolbar-merge-unmerge').click()
    await expect(cell(page, 'B2')).toHaveAttribute('rowspan', '1')
    await expect(cellDisplay(page, 'B2')).toHaveText('edited-anchor')
    await expect(cell(page, 'C3')).toBeVisible()
  })

  // KNOWN GAP (source-verified — see CASES.md MF-11): the keyboard dispatcher
  // moves the active cell by ±1 with no merge awareness
  // (`spreadsheet-ui-core/src/keyboard/index.ts` createMoveIntent /
  // moveSelection never see merge facts), and clicking a merge selects a
  // range whose focus — thus the active cell — is the covered bottom-right
  // corner. Excel treats the merged region as ONE cell: the address box and
  // formula bar follow the anchor, and one arrow keystroke leaves the region.
  test.fixme(
    'the merged region acts as ONE cell for the active cell and arrow navigation',
    async ({ page }) => {
      await gotoWave5(page)
      await mergeB2C3(page)

      // Clicking anywhere on the merge puts the ANCHOR in the address box and
      // the anchor's content in the formula bar (today: 'C3' + empty input).
      await cell(page, 'B2').click()
      await expect(addrBox(page)).toHaveText('B2')
      await expect(page.getByTestId('formula-bar-input')).toHaveValue('120')

      // Entering the merge from the right lands on the anchor in one keystroke.
      await cell(page, 'D2').click()
      await expect(addrBox(page)).toHaveText('D2')
      await page.keyboard.press('ArrowLeft')
      await expect(addrBox(page)).toHaveText('B2')

      // Leaving the merge skips the covered column/row in one keystroke.
      await page.keyboard.press('ArrowRight')
      await expect(addrBox(page)).toHaveText('D2')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowDown')
      await expect(addrBox(page)).toHaveText('B4')
    },
  )
})
