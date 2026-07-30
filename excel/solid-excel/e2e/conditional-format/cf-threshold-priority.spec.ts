import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  guardConsoleErrors,
  typeIntoCell,
  withEnglishLocale,
} from '../helpers'

/**
 * CF-05..CF-08 (CASES.md): conditional-format evaluation dynamics on the
 * Wave 5 static demo. Rules are evaluated at projection-read time
 * (`conditionalRuleAppliesToCell`), so editing a cell across a rule
 * threshold repaints it live. Multiple rules resolve by ascending
 * priority with first-match-wins fall-through.
 *
 * Rule templates pinned from `defaultRuleForKind`:
 * - cell-value → `gt 0`, bgColor #fef3c7 → rgb(254, 243, 199)
 * - color-scale → matches any numeric cell, bgColor = maxColor #00ff00
 *   → rgb(0, 255, 0) (flat color, no gradient in this wave)
 */

const RULE1_BG = 'rgb(254, 243, 199)' // #fef3c7 (cell-value gt 0)
const RULE2_BG = 'rgb(0, 255, 0)' // #00ff00 (color-scale maxColor)

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')
}

function dialog(page: Page) {
  return page.getByTestId('wave5-conditional-format')
}

async function openDialog(page: Page) {
  await page.getByTestId('toolbar-btn-conditional-format').click()
  await expect(dialog(page)).toBeVisible()
}

async function saveRuleOfKind(page: Page, kind: string) {
  await openDialog(page)
  await dialog(page).getByTestId('cf-rule-kind-select').selectOption(kind)
  await dialog(page).getByTestId('cf-save-button').click()
  await expect(dialog(page)).toBeHidden()
}

function backgroundOf(page: Page, addr: string) {
  return cell(page, addr).evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor)
}

test.describe('Conditional format — thresholds, priority, rule list', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('editing the cell across the gt-0 threshold repaints it live', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()
    await saveRuleOfKind(page, 'cell-value')

    // B2 = 120 matches gt 0 → painted.
    await expect(cell(page, 'B2')).toHaveAttribute('data-has-conditional-format', 'true')
    expect(await backgroundOf(page, 'B2')).toBe(RULE1_BG)

    // Cross the threshold downwards → rule no longer applies.
    await typeIntoCell(page, 'B2', '-8')
    await expect(cell(page, 'B2')).toHaveAttribute('data-has-conditional-format', 'false')
    expect(await backgroundOf(page, 'B2')).not.toBe(RULE1_BG)

    // Cross back → painted again without touching the dialog.
    await typeIntoCell(page, 'B2', '55')
    await expect(cell(page, 'B2')).toHaveAttribute('data-has-conditional-format', 'true')
    expect(await backgroundOf(page, 'B2')).toBe(RULE1_BG)
  })

  test('two stacked rules: lower priority wins, second rule catches the fall-through', async ({
    page,
  }) => {
    await gotoWave5(page)

    // Rule 1 (priority 0): cell-value gt 0 → #fef3c7.
    await cell(page, 'B2').click()
    await saveRuleOfKind(page, 'cell-value')
    // Rule 2 (priority 1): color-scale (any numeric) → #00ff00.
    await cell(page, 'B2').click()
    await saveRuleOfKind(page, 'color-scale')

    // B2 = 120 matches BOTH rules → the earlier (priority 0) one paints.
    await expect(cell(page, 'B2')).toHaveAttribute('data-has-conditional-format', 'true')
    expect(await backgroundOf(page, 'B2')).toBe(RULE1_BG)

    // -8 fails gt 0 but is still numeric → falls through to rule 2.
    await typeIntoCell(page, 'B2', '-8')
    await expect(cell(page, 'B2')).toHaveAttribute('data-has-conditional-format', 'true')
    expect(await backgroundOf(page, 'B2')).toBe(RULE2_BG)

    // Non-numeric text matches neither rule → unpainted.
    await typeIntoCell(page, 'B2', 'north-ish')
    await expect(cell(page, 'B2')).toHaveAttribute('data-has-conditional-format', 'false')
  })

  test('the dialog rule list grows with each save and shows kind + priority', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'C5').click()
    await saveRuleOfKind(page, 'cell-value')

    await cell(page, 'C5').click()
    await openDialog(page)
    const items = dialog(page).getByTestId('cf-rule-list').locator('li')
    await expect(items).toHaveCount(1)
    await expect(items.first()).toHaveAttribute('data-rule-kind', 'cell-value')
    await expect(items.first()).toContainText('priority 0')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()

    await cell(page, 'C5').click()
    await saveRuleOfKind(page, 'color-scale')

    await cell(page, 'C5').click()
    await openDialog(page)
    await expect(items).toHaveCount(2)
    await expect(items.nth(1)).toHaveAttribute('data-rule-kind', 'color-scale')
    await expect(items.nth(1)).toContainText('priority 1')
  })

  test('remove stays disabled from the toolbar entry point (no rule targeted)', async ({
    page,
  }) => {
    await gotoWave5(page)

    // Even with rules saved on the sheet, the toolbar entry opens the
    // editor with a null draft, so remove has nothing to target (CF-09
    // stays P2 until an existing-rule entry point exists).
    await cell(page, 'D6').click()
    await saveRuleOfKind(page, 'cell-value')

    await cell(page, 'D6').click()
    await openDialog(page)
    await expect(dialog(page).getByTestId('cf-remove-button')).toBeDisabled()
    await expect(dialog(page).getByTestId('cf-save-button')).toBeEnabled()
  })
})
