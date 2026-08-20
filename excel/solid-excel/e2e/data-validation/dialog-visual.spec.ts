import { expect, test, type Page } from '@playwright/test'

import { cell, expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

async function openDataValidationDialog(page: Page) {
  guardConsoleErrors(page)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await cell(page, 'C3').click()
  await page.getByTestId('toolbar-btn-data-validation').click()
  await expect(page.getByTestId('wave5-data-validation')).toBeVisible()
}

async function dialogMetrics(page: Page, theme: 'light' | 'dark') {
  return page.getByTestId('wave5-data-validation').evaluate((dialog, nextTheme) => {
    const host = dialog.closest<HTMLElement>('.vnext-demo, .demo-page')!
    if (nextTheme === 'dark') host.dataset.spreadsheetTheme = 'dark'
    else delete host.dataset.spreadsheetTheme

    const resolveColor = (token: string) => {
      const sample = document.createElement('span')
      sample.style.color = `var(${token})`
      dialog.append(sample)
      const color = getComputedStyle(sample).color
      sample.remove()
      return color
    }
    const style = (selector: string) =>
      getComputedStyle(dialog.querySelector<HTMLElement>(selector)!)
    const rectHeight = (selector: string) =>
      dialog.querySelector<HTMLElement>(selector)!.getBoundingClientRect().height

    return {
      bodyBackground: style('.dv-dialog-body').backgroundColor,
      clearColor: style('[data-testid="validation-clear-button"]').color,
      controlHeights: [
        'validation-kind-select',
        'validation-list-values',
        'validation-clear-button',
        'validation-cancel-button',
        'validation-save-button',
      ].map(
        (testId) =>
          dialog.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.getBoundingClientRect()
            .height,
      ),
      footerJustify: style('.dv-dialog-footer').justifyContent,
      headerHeight: rectHeight('.dv-dialog-header'),
      primaryBackground: style('[data-testid="validation-save-button"]').backgroundColor,
      rangeBackground: style('[data-testid="validation-range"]').backgroundColor,
      rangeBorder: style('[data-testid="validation-range"]').borderColor,
      rangeColor: style('[data-testid="validation-range"]').color,
      tokens: {
        error: resolveColor('--error-text'),
        green: resolveColor('--excel-green'),
        greenText: resolveColor('--excel-green-text'),
        primary: resolveColor('--dialog-primary-bg'),
        select: resolveColor('--select-bg'),
        surface: resolveColor('--bg-surface'),
      },
    }
  }, theme)
}

test('Data Validation inherits the Office web shell in light and dark themes', async ({ page }) => {
  await openDataValidationDialog(page)

  const light = await dialogMetrics(page, 'light')
  const dark = await dialogMetrics(page, 'dark')
  for (const metrics of [light, dark]) {
    expect(metrics.bodyBackground).toBe(metrics.tokens.surface)
    expect(metrics.clearColor).toBe(metrics.tokens.error)
    expect(metrics.controlHeights).toEqual([28, 28, 28, 28, 28])
    expect(metrics.footerJustify).toBe('flex-end')
    expect(metrics.headerHeight).toBe(40)
    expect(metrics.primaryBackground).toBe(metrics.tokens.primary)
    expect(metrics.rangeBackground).toBe(metrics.tokens.select)
    expect(metrics.rangeBorder).toBe(metrics.tokens.green)
    expect(metrics.rangeColor).toBe(metrics.tokens.greenText)
  }
  expect(dark.bodyBackground).not.toBe(light.bodyBackground)
  expect(dark.rangeColor).not.toBe(light.rangeColor)

  await expectNoConsoleErrors(page)
})
