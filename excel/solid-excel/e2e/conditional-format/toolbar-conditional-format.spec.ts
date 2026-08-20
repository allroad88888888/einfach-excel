import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'
import { cell, guardConsoleErrors, withEnglishLocale } from '../helpers'

const CONDITIONAL_FORMAT_STYLE_URL = new URL(
  '../../../spreadsheet-ui-styles/features/conditional-format-dialog.css',
  import.meta.url,
)

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

function conditionalFormatButton(page: Page) {
  return page.getByTestId('toolbar-btn-conditional-format')
}

function conditionalFormatDialog(page: Page) {
  return page.getByTestId('wave5-conditional-format')
}

function assertLocalizedLabel(label: string | null, rawKey: string, field: string) {
  expect(label, `${field} exists`).toBeTruthy()
  expect(label, `${field} is not raw key`).not.toBe(rawKey)
  expect(label, `${field} has no translation token punctuation`).not.toContain('.')
}

async function dialogInteriorMetrics(page: Page, theme: 'light' | 'dark') {
  return page.evaluate((nextTheme) => {
    const host = document.querySelector<HTMLElement>('.vnext-demo')!
    if (nextTheme === 'dark') host.dataset.spreadsheetTheme = 'dark'
    else delete host.dataset.spreadsheetTheme

    const dialog = host.querySelector<HTMLElement>('.conditional-format-dialog')!
    const header = dialog.querySelector<HTMLElement>('.cf-dialog-header')!
    const select = dialog.querySelector<HTMLSelectElement>('#cf-rule-kind-select')!
    const list = dialog.querySelector<HTMLElement>('.cf-rule-list')!
    const preview = dialog.querySelector<HTMLElement>('.cf-rule-preview')!
    const primary = dialog.querySelector<HTMLElement>('[data-variant="primary"]')!
    const danger = dialog.querySelector<HTMLButtonElement>('[data-variant="danger"]')!
    danger.removeAttribute('disabled')
    select.focus()

    const resolveColor = (token: string) => {
      const sample = document.createElement('span')
      sample.style.color = `var(${token})`
      dialog.append(sample)
      const color = getComputedStyle(sample).color
      sample.remove()
      return color
    }
    const selectStyle = getComputedStyle(select)
    const primaryStyle = getComputedStyle(primary)
    const dangerStyle = getComputedStyle(danger)
    return {
      controlHeights: [select, primary, danger].map(
        (element) => element.getBoundingClientRect().height,
      ),
      dangerBorder: dangerStyle.borderColor,
      dangerColor: dangerStyle.color,
      errorToken: resolveColor('--error-text'),
      focusColor: selectStyle.outlineColor,
      focusToken: resolveColor('--office-blue'),
      headerHeight: header.getBoundingClientRect().height,
      listBackground: getComputedStyle(list).backgroundColor,
      previewBackground: getComputedStyle(preview).backgroundColor,
      secondarySurfaceToken: resolveColor('--bg-chrome-light'),
      primaryBackground: primaryStyle.backgroundColor,
      primaryToken: resolveColor('--dialog-primary-bg'),
    }
  }, theme)
}

test.describe('Wave 5 toolbar — conditional formatting', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('toolbar-btn-conditional-format is visible, enabled, and not raw keys', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'C3').click()

    const button = conditionalFormatButton(page)
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()

    const tooltip = await button.getAttribute('data-tooltip')
    const ariaLabel = await button.getAttribute('aria-label')
    assertLocalizedLabel(
      tooltip,
      'toolbar.condFmt.title',
      'toolbar-btn-conditional-format data-tooltip',
    )
    assertLocalizedLabel(
      ariaLabel,
      'toolbar.condFmt.title',
      'toolbar-btn-conditional-format aria-label',
    )

    await button.click()
    await expect(conditionalFormatDialog(page)).toBeVisible()
  })

  test('conditional-format dialog opens and basic controls exist', async ({ page }) => {
    await gotoWave5(page)
    const target = 'C3'
    await cell(page, target).click()
    await conditionalFormatButton(page).click()

    const dialog = conditionalFormatDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('cf-rule-kind-select')).toBeVisible()
    await expect(dialog.getByTestId('cf-rule-list')).toBeVisible()
    await expect(dialog.getByTestId('cf-save-button')).toBeVisible()
    await expect(dialog.getByTestId('cf-cancel-button')).toBeVisible()
    await expect(dialog.getByTestId('cf-remove-button')).toBeVisible()
    await expect(dialog.getByTestId('dialog-close-x')).toBeVisible()

    await dialog.getByTestId('cf-save-button').click()
    await expect(dialog).toBeHidden()
    await expect(cell(page, target)).toHaveAttribute('data-has-conditional-format', 'true')
  })

  test('dialog interior is token-only and follows the Office web shell in both themes', async ({
    page,
  }) => {
    const source = (await readFile(CONDITIONAL_FORMAT_STYLE_URL, 'utf8')).replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    expect(source.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi) ?? []).toEqual([])

    await gotoWave5(page)
    await cell(page, 'C3').click()
    await conditionalFormatButton(page).click()
    await expect(conditionalFormatDialog(page)).toHaveAttribute('aria-busy', 'false')

    const light = await dialogInteriorMetrics(page, 'light')
    const dark = await dialogInteriorMetrics(page, 'dark')
    for (const metrics of [light, dark]) {
      expect(metrics.headerHeight).toBe(40)
      expect(metrics.controlHeights).toEqual([28, 28, 28])
      expect(metrics.focusColor).toBe(metrics.focusToken)
      expect(metrics.primaryBackground).toBe(metrics.primaryToken)
      expect(metrics.dangerColor).toBe(metrics.errorToken)
      expect(metrics.dangerBorder).toBe(metrics.errorToken)
      expect(metrics.listBackground).toBe(metrics.secondarySurfaceToken)
      expect(metrics.previewBackground).toBe(metrics.secondarySurfaceToken)
    }
    expect(dark.listBackground).not.toBe(light.listBackground)
    expect(dark.dangerColor).not.toBe(light.dangerColor)
  })

  test('conditional-format dialog closes with Escape and header close X', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'C3').click()
    const button = conditionalFormatButton(page)

    await button.click()
    const dialog = conditionalFormatDialog(page)
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await button.click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('dialog-close-x')).toBeVisible()
    await dialog.getByTestId('dialog-close-x').click()
    await expect(dialog).toBeHidden()
  })

  /**
   * Round-trip the default `cell-value gt 0` rule into the projection so
   * the spec proves the toolbar entry point actually paints cells — not
   * just that the dialog renders its controls. Selecting B2 (=120) and
   * saving with the default kind installs a rule scoped to the selection
   * with `format: { bgColor: '#fef3c7' }`; the static backend's projection
   * then merges that bgColor onto the cell, and the grid translates it
   * into a `<td style="background:…">` declaration the assertion can read.
   */
  test('saving the default rule paints the matching cell with bgColor #fef3c7', async ({
    page,
  }) => {
    await gotoWave5(page)
    const target = 'B2'
    // Wave 5 seed: B2 = 120 (matrix North/Q1), a positive number that the
    // default cell-value-gt-0 rule will match.
    await cell(page, target).click()
    await conditionalFormatButton(page).click()
    const dialog = conditionalFormatDialog(page)
    await expect(dialog).toBeVisible()

    // Default kind is `cell-value` and dialog auto-saves the default
    // template — no further input needed.
    await dialog.getByTestId('cf-save-button').click()
    await expect(dialog).toBeHidden()

    // 1) The cell carries the dataset flag so future per-cell debugging
    //    can locate it without re-deriving the format mapping.
    await expect(cell(page, target)).toHaveAttribute('data-has-conditional-format', 'true')

    // 2) The grid's `getCellBackgroundStyle` resolves the rule's bgColor
    //    onto the `<td>` inline style. Browsers normalize the hex to rgb,
    //    so we read the computed value rather than asserting the literal.
    const bg = await cell(page, target).evaluate((el) => {
      return window.getComputedStyle(el as HTMLElement).backgroundColor
    })
    // #fef3c7 → rgb(254, 243, 199)
    expect(bg).toBe('rgb(254, 243, 199)')
  })
})
