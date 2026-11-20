import { expect, test } from '@playwright/test'
import { book, button, start } from './support'
import { showRibbonControl } from '../support/ribbon'

for (const bundler of ['vite', 'rspack'] as const) {
  test(`installed ${bundler} consumer runs @einfach-excel/xlsx round-trip and packed plugins with ./core`, async ({
    page,
  }) => {
    const errors = await start(page, bundler)
    const xlsxResult = await page.evaluate(() => window.packageHost.xlsxRoundTrip())
    expect(xlsxResult.byteLength).toBeGreaterThan(1000)
    expect(xlsxResult.sheetCount).toBe(3)

    const coreBefore = await page.evaluate(() => window.packageHost.pluginCoreState())
    expect(coreBefore).toEqual({ patternOpen: false, datePickerVisible: false })

    await showRibbonControl(book(page), 'Pattern fill')
    await button(page, 'Pattern fill').click()
    await expect(book(page).getByRole('dialog', { name: 'Pattern fill' })).toBeVisible()
    expect(await page.evaluate(() => window.packageHost.pluginCoreState())).toEqual({
      patternOpen: true,
      datePickerVisible: false,
    })
    await book(page).getByRole('dialog', { name: 'Pattern fill' }).getByRole('button', { name: 'Cancel' }).click()

    const chartResult = await page.evaluate(() => window.packageHost.insertChart())
    expect(chartResult).toEqual({ status: 'ok', count: 1 })
    await expect(book(page).getByRole('img', { name: 'Installed Chart', exact: true })).toBeVisible()
    await expect(book(page).locator('.plugin-chart-canvas canvas')).toHaveCount(1)
    expect(errors).toEqual([])
  })
}

test('installed vite and rspack consumers render identical toolbar, language control, formula bar, and status bar metrics', async ({
  page,
}) => {
  const measure = async (bundler: 'vite' | 'rspack') => {
    const errors = await start(page, bundler)
    expect(errors).toEqual([])
    return page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(`#first ${selector}`)!
        const computed = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          fontSize: computed.fontSize,
          boxSizing: computed.boxSizing,
          height: Math.round(rect.height),
        }
      }
      return {
        languageSelect: read('.language-select'),
        ribbonTab: read('.ribbon-tab'),
        toolButton: read('.tool-button'),
        toolSelect: read('.tool-select'),
        formulaBar: read('.formula-bar'),
        footer: read('.workbook-footer'),
        statusItems: read('.status-items'),
        selectionStats: read('.selection-statistics'),
      }
    })
  }

  const viteMetrics = await measure('vite')
  const rspackMetrics = await measure('rspack')

  expect(viteMetrics.languageSelect.fontSize).toBe('12px')
  expect(viteMetrics.ribbonTab.fontSize).toBe('11px')
  expect(viteMetrics.toolButton.fontSize).toBe('12px')
  expect(viteMetrics.toolSelect.fontSize).toBe('12px')
  expect(viteMetrics.formulaBar.boxSizing).toBe('border-box')
  expect(viteMetrics.formulaBar.height).toBe(36)
  expect(rspackMetrics).toEqual(viteMetrics)
})
