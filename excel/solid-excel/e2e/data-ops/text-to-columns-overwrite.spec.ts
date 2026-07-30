import { expect, test, type Page } from '@playwright/test'

import { cell, cellDisplay, withEnglishLocale } from '../helpers'

/**
 * Text to Columns — target-area OVERWRITE behavior on the Wave 5 static demo.
 *
 * Current product behavior (asserted as-is): there is NO "replace existing
 * data?" confirmation step — Finish commits the whole split as one
 * `importCellChunks` transaction and silently overwrites whatever the target
 * columns held (Excel, by contrast, asks before replacing). The compensating
 * guarantee the product DOES make is transactional undo: the backend records
 * every overwritten cell (`recordCellBefore` per cell under one
 * `beginUndoableMutation`), so a single Ctrl+Z restores BOTH the source
 * column's original text AND the clobbered neighbor in one step.
 *
 * If a confirmation flow ever ships, the "closes without asking" assertion
 * below is the one that flips.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')
}

async function seedCell(page: Page, addr: string, value: string) {
  await cell(page, addr).click()
  await page.keyboard.type(value)
  await page.keyboard.press('Enter')
}

async function openTtcFromDataMenu(page: Page) {
  await page.getByTestId('menu-bar-button-data').click()
  await expect(page.getByTestId('menu-bar-dropdown-data')).toBeVisible()
  const menuItem = page.getByTestId('menu-bar-item-data.textToColumns')
  await expect(menuItem).toBeEnabled()
  await menuItem.click()
  const dialog = page.getByTestId('wave5-text-to-columns')
  await expect(dialog).toBeVisible()
  return dialog
}

function pressUndo(page: Page) {
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control'
  return page.keyboard.press(`${meta}+z`)
}

test.describe('text-to-columns — overwriting an occupied target area', () => {
  test('Finish overwrites the neighbor silently and one undo restores source and neighbor', async ({
    page,
  }) => {
    await gotoWave5(page)

    // H2 holds pre-existing data squarely inside the split's target area.
    await seedCell(page, 'H2', 'existing')
    await seedCell(page, 'G2', 'x,y')
    await expect(cellDisplay(page, 'H2')).toHaveText('existing')

    await cell(page, 'G2').click()
    const dialog = await openTtcFromDataMenu(page)

    await page.getByTestId('ttc-next-button').click()
    await expect(page.getByTestId('ttc-step-2-delimited')).toBeVisible()
    await page.getByTestId('ttc-delim-tab').uncheck()
    await page.getByTestId('ttc-delim-comma').check()
    await page.getByTestId('ttc-next-button').click()
    await expect(page.getByTestId('ttc-step-3')).toBeVisible()

    // Finish closes the wizard directly — no confirmation dialog interposes
    // even though H2 is occupied. This IS the current product contract.
    await page.getByTestId('ttc-finish-button').click()
    await expect(dialog).toHaveCount(0)

    // The neighbor was silently replaced by the second token.
    await expect(cellDisplay(page, 'G2')).toHaveText('x')
    await expect(cellDisplay(page, 'H2')).toHaveText('y')

    // ONE undo step reverts the whole commit: the source cell's original
    // text AND the overwritten neighbor come back together.
    await cell(page, 'G2').click()
    await pressUndo(page)
    await expect(cellDisplay(page, 'G2')).toHaveText('x,y')
    await expect(cellDisplay(page, 'H2')).toHaveText('existing')
  })
})
