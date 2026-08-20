import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { withEnglishLocale } from '../helpers'

const FEATURE_CSS_URL = new URL(
  '../../../spreadsheet-ui-styles/features/text-to-columns-dialog.css',
  import.meta.url,
)

async function openTextToColumns(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  const grid = page.getByTestId('wave5-grid')
  await expect(grid).toBeVisible({ timeout: 30_000 })
  const sourceCell = grid.locator('td.cell[data-cell-addr="B2"]')
  await expect(sourceCell.locator('.cell-display')).toHaveText('120')
  await sourceCell.click()
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('spreadsheet:open-text-to-columns'))
  })
  const dialog = page.getByTestId('wave5-text-to-columns')
  await expect(dialog).toBeVisible()
  return dialog
}

async function readOfficeMetrics(page: Page, theme: 'light' | 'dark') {
  return page.evaluate((nextTheme) => {
    const host = document.querySelector<HTMLElement>('.app')!
    if (nextTheme === 'dark') host.dataset.spreadsheetTheme = 'dark'
    else delete host.dataset.spreadsheetTheme

    const dialog = document.querySelector<HTMLElement>('.text-to-columns-dialog')!
    const header = dialog.querySelector<HTMLElement>('.ttc-header')!
    const footer = dialog.querySelector<HTMLElement>('.ttc-footer')!
    const preview = dialog.querySelector<HTMLElement>('.ttc-preview-scroll')!
    const fieldset = dialog.querySelector<HTMLFieldSetElement>('.ttc-section')!
    const primary = dialog.querySelector<HTMLButtonElement>('.ttc-btn-primary')!
    const back = dialog.querySelector<HTMLButtonElement>('[data-testid="ttc-back-button"]')!
    const controls = [...dialog.querySelectorAll<HTMLElement>('button, .ttc-input, .ttc-select')]
    const focusTarget =
      dialog.querySelector<HTMLSelectElement>('.ttc-select') ??
      dialog.querySelector<HTMLInputElement>('input')!
    focusTarget.focus()

    const resolveColor = (token: string) => {
      const sample = document.createElement('span')
      sample.style.color = `var(${token})`
      dialog.append(sample)
      const color = getComputedStyle(sample).color
      sample.remove()
      return color
    }
    return {
      background: getComputedStyle(dialog).backgroundColor,
      backBackground: getComputedStyle(back).backgroundColor,
      backColor: getComputedStyle(back).color,
      borderColor: getComputedStyle(dialog).borderColor,
      borderRadius: getComputedStyle(dialog).borderRadius,
      controlHeights: controls.map((control) => control.getBoundingClientRect().height),
      disabledBackgroundToken: resolveColor('--bg-chrome'),
      disabledTextToken: resolveColor('--text-disabled'),
      fieldsetBorder: getComputedStyle(fieldset).borderColor,
      focusColor: getComputedStyle(focusTarget).outlineColor,
      footerJustify: getComputedStyle(footer).justifyContent,
      headerHeight: header.getBoundingClientRect().height,
      previewBackground: getComputedStyle(preview).backgroundColor,
      primaryBackground: getComputedStyle(primary).backgroundColor,
      surfaceToken: resolveColor('--bg-surface'),
      borderToken: resolveColor('--border'),
      cellToken: resolveColor('--bg-cell'),
      focusToken: resolveColor('--office-blue'),
      primaryToken: resolveColor('--dialog-primary-bg'),
    }
  }, theme)
}

test.describe('text-to-columns Office web alignment', () => {
  test('feature stylesheet uses tokens instead of literal colors', async () => {
    const source = (await readFile(FEATURE_CSS_URL, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(source.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi) ?? []).toEqual([])
  })

  test('inherits the shared shell in light and dark themes', async ({ page }) => {
    const dialog = await openTextToColumns(page)
    await expect(dialog.locator('.ttc-step-indicator')).toContainText('1 / 3')
    await expect(dialog.locator('fieldset[data-testid="ttc-step-1"]')).toBeVisible()
    await expect(dialog.getByTestId('ttc-preview')).toHaveAttribute(
      'aria-labelledby',
      'text-to-columns-preview-title',
    )

    const lightDisabled = await readOfficeMetrics(page, 'light')
    const darkDisabled = await readOfficeMetrics(page, 'dark')
    for (const metrics of [lightDisabled, darkDisabled]) {
      expect(metrics.backBackground).toBe(metrics.disabledBackgroundToken)
      expect(metrics.backColor).toBe(metrics.disabledTextToken)
    }

    await dialog.getByTestId('ttc-next-button').click()
    await dialog.getByTestId('ttc-next-button').click()
    await expect(dialog.locator('.ttc-step-indicator')).toContainText('3 / 3')
    await expect(dialog.locator('fieldset[data-testid="ttc-step-3"]')).toBeVisible()

    const light = await readOfficeMetrics(page, 'light')
    const dark = await readOfficeMetrics(page, 'dark')
    for (const metrics of [light, dark]) {
      expect(metrics.background).toBe(metrics.surfaceToken)
      expect(metrics.borderColor).toBe(metrics.borderToken)
      expect(metrics.borderRadius).toBe('4px')
      expect(metrics.headerHeight).toBe(40)
      expect(metrics.controlHeights.every((height) => height === 28)).toBe(true)
      expect(metrics.focusColor).toBe(metrics.focusToken)
      expect(metrics.footerJustify).toBe('flex-end')
      expect(metrics.primaryBackground).toBe(metrics.primaryToken)
      expect(metrics.fieldsetBorder).toBe(metrics.borderToken)
      expect(metrics.previewBackground).toBe(metrics.cellToken)
    }
    expect(dark.background).not.toBe(light.background)
    expect(dark.previewBackground).not.toBe(light.previewBackground)
  })
})
