import { expect, test, type Page } from '@playwright/test'

import { cell, cellDisplay, withEnglishLocale } from '../helpers'

/**
 * Text to Columns — delimiter COMBINATIONS on the Wave 5 static demo.
 *
 * The existing spec covers single-delimiter comma splits; this one pins the
 * comma+space combination in both consecutive-delimiter modes:
 *
 *   1. `treatConsecutiveAsOne` OFF (the wizard default, Excel parity): every
 *      delimiter char emits a boundary, so `", "` produces an EMPTY token
 *      between the comma and the space.
 *   2. `treatConsecutiveAsOne` ON: any run of checked delimiters collapses
 *      into one boundary, so `", "` and `",  "` both yield a single split.
 *
 * Assertions cover the live step-2 preview (`ttc-preview-cell-<row>-<i>`)
 * AND the committed cells, so a preview/commit divergence cannot hide.
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

/** Step 1 → Step 2, then switch the delimiter set from tab to comma+space. */
async function advanceToCommaSpaceStep2(page: Page) {
  await page.getByTestId('ttc-next-button').click()
  await expect(page.getByTestId('ttc-step-2-delimited')).toBeVisible()
  await page.getByTestId('ttc-delim-tab').uncheck()
  await page.getByTestId('ttc-delim-comma').check()
  await page.getByTestId('ttc-delim-space').check()
}

test.describe('text-to-columns — comma+space delimiter combination', () => {
  test('consecutive delimiters OFF keeps the empty token between comma and space', async ({
    page,
  }) => {
    await gotoWave5(page)
    // `a, b,c` — comma then space is TWO boundaries when runs do not collapse:
    // tokens are `a`, `` (between `,` and ` `), `b`, `c`.
    await seedCell(page, 'G2', 'a, b,c')

    await cell(page, 'G2').click()
    const dialog = await openTtcFromDataMenu(page)
    await advanceToCommaSpaceStep2(page)

    // Default is OFF (Excel parity) — assert rather than assume.
    await expect(page.getByTestId('ttc-consecutive')).not.toBeChecked()

    // Live preview shows all four tokens, empty one included.
    await expect(page.getByTestId('ttc-preview-cell-1-0')).toHaveText('a')
    await expect(page.getByTestId('ttc-preview-cell-1-1')).toHaveText('')
    await expect(page.getByTestId('ttc-preview-cell-1-2')).toHaveText('b')
    await expect(page.getByTestId('ttc-preview-cell-1-3')).toHaveText('c')

    await page.getByTestId('ttc-next-button').click()
    await expect(page.getByTestId('ttc-step-3')).toBeVisible()
    await page.getByTestId('ttc-finish-button').click()
    await expect(dialog).toHaveCount(0)

    await expect(cellDisplay(page, 'G2')).toHaveText('a')
    await expect(cellDisplay(page, 'H2')).toHaveText('')
    await expect(cellDisplay(page, 'I2')).toHaveText('b')
    await expect(cellDisplay(page, 'J2')).toHaveText('c')
  })

  test('treatConsecutiveAsOne collapses mixed comma+space runs into single boundaries', async ({
    page,
  }) => {
    await gotoWave5(page)
    // `a, b,  c` — the `, ` run and the `,  ` run each collapse to ONE
    // boundary, so exactly three tokens come out.
    await seedCell(page, 'G2', 'a, b,  c')

    await cell(page, 'G2').click()
    const dialog = await openTtcFromDataMenu(page)
    await advanceToCommaSpaceStep2(page)

    await page.getByTestId('ttc-consecutive').check()

    await expect(page.getByTestId('ttc-preview-cell-1-0')).toHaveText('a')
    await expect(page.getByTestId('ttc-preview-cell-1-1')).toHaveText('b')
    await expect(page.getByTestId('ttc-preview-cell-1-2')).toHaveText('c')

    await page.getByTestId('ttc-next-button').click()
    await expect(page.getByTestId('ttc-step-3')).toBeVisible()
    await page.getByTestId('ttc-finish-button').click()
    await expect(dialog).toHaveCount(0)

    await expect(cellDisplay(page, 'G2')).toHaveText('a')
    await expect(cellDisplay(page, 'H2')).toHaveText('b')
    await expect(cellDisplay(page, 'I2')).toHaveText('c')
    // No fourth column was emitted.
    await expect(cellDisplay(page, 'J2')).toHaveText('')
  })
})
