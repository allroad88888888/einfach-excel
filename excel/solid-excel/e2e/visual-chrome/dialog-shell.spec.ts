import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

const DIALOG_SKIN_URL = new URL(
  '../../../spreadsheet-ui-styles/styles/dialog-skin.css',
  import.meta.url,
)

async function gotoDialogProbe(page: Page) {
  guardConsoleErrors(page)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })

  await page.evaluate(() => {
    const host = document.querySelector('.vnext-demo')!
    const fixture = document.createElement('div')
    fixture.dataset.testid = 'dialog-contract-fixture'
    fixture.innerHTML = `
      <section class="dialog-contract-probe" role="dialog" aria-modal="true" aria-label="Probe">
        <header class="probe-header">
          <h2>Dialog contract</h2>
          <button class="dialog-close-x" type="button" aria-label="Close">×</button>
        </header>
        <main><input data-testid="dialog-probe-input" aria-label="Value"></main>
        <footer class="probe-footer">
          <button type="button">Cancel</button>
          <button type="button" data-variant="primary">Save</button>
        </footer>
      </section>
      <section class="spreadsheet-filter-dropdown" role="dialog" aria-label="Filter probe"></section>
      <section class="spreadsheet-color-popover" role="dialog" aria-label="Color probe"></section>
    `
    host.append(fixture)
  })
}

async function dialogMetrics(page: Page, theme: 'light' | 'dark') {
  return page.evaluate((nextTheme) => {
    const host = document.querySelector<HTMLElement>('.vnext-demo')!
    if (nextTheme === 'dark') host.dataset.spreadsheetTheme = 'dark'
    else delete host.dataset.spreadsheetTheme

    const dialog = host.querySelector<HTMLElement>('.dialog-contract-probe')!
    const header = dialog.querySelector<HTMLElement>('.probe-header')!
    const footer = dialog.querySelector<HTMLElement>('.probe-footer')!
    const input = dialog.querySelector<HTMLInputElement>('input')!
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button')]
    const primary = dialog.querySelector<HTMLElement>('[data-variant="primary"]')!
    input.focus()

    const resolvedColor = (token: string) => {
      const sample = document.createElement('span')
      sample.style.color = `var(${token})`
      dialog.append(sample)
      const color = getComputedStyle(sample).color
      sample.remove()
      return color
    }
    const luminance = (color: string) => {
      const values = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
      const channel = (value: number) => {
        const normalized = value / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(values[0]) + 0.7152 * channel(values[1]) + 0.0722 * channel(values[2])
    }
    const contrast = (foreground: string, background: string) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
      return (values[0] + 0.05) / (values[1] + 0.05)
    }

    const dialogStyle = getComputedStyle(dialog)
    const inputStyle = getComputedStyle(input)
    const primaryStyle = getComputedStyle(primary)
    const dialogRect = dialog.getBoundingClientRect()
    return {
      background: dialogStyle.backgroundColor,
      borderColor: dialogStyle.borderColor,
      borderRadius: dialogStyle.borderRadius,
      borderWidth: dialogStyle.borderWidth,
      centerOffset: Math.abs(dialogRect.left + dialogRect.width / 2 - innerWidth / 2),
      controlHeights: [input, ...buttons].map((element) => element.getBoundingClientRect().height),
      focusColor: inputStyle.outlineColor,
      focusWidth: inputStyle.outlineWidth,
      footerJustify: getComputedStyle(footer).justifyContent,
      headerHeight: header.getBoundingClientRect().height,
      overlayColor: resolvedColor('--dialog-overlay'),
      primaryBackground: primaryStyle.backgroundColor,
      primaryContrast: contrast(primaryStyle.color, primaryStyle.backgroundColor),
      shadow: dialogStyle.boxShadow,
      surfaceToken: resolvedColor('--bg-surface'),
      textColor: dialogStyle.color,
      textContrast: contrast(dialogStyle.color, dialogStyle.backgroundColor),
      textToken: resolvedColor('--text-default'),
      borderToken: resolvedColor('--border'),
      focusToken: resolvedColor('--office-blue'),
      primaryToken: resolvedColor('--dialog-primary-bg'),
    }
  }, theme)
}

test.describe('Office web dialog shell guards', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('shared skin contains no literal colors', async () => {
    const source = (await readFile(DIALOG_SKIN_URL, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(source.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi) ?? []).toEqual([])
  })

  test('light and dark themes preserve the modal visual contract', async ({ page }) => {
    await gotoDialogProbe(page)

    const light = await dialogMetrics(page, 'light')
    const dark = await dialogMetrics(page, 'dark')
    for (const metrics of [light, dark]) {
      expect(metrics.background).toBe(metrics.surfaceToken)
      expect(metrics.borderColor).toBe(metrics.borderToken)
      expect(metrics.borderRadius).toBe('4px')
      expect(metrics.borderWidth).toBe('1px')
      expect(metrics.centerOffset).toBeLessThanOrEqual(1)
      expect(metrics.controlHeights).toEqual([28, 28, 28, 28])
      expect(metrics.focusColor).toBe(metrics.focusToken)
      expect(metrics.focusWidth).toBe('2px')
      expect(metrics.footerJustify).toBe('flex-end')
      expect(metrics.headerHeight).toBe(40)
      expect(metrics.primaryBackground).toBe(metrics.primaryToken)
      expect(metrics.primaryContrast).toBeGreaterThanOrEqual(4.5)
      expect(metrics.shadow).toContain(metrics.overlayColor)
      expect(metrics.textColor).toBe(metrics.textToken)
      expect(metrics.textContrast).toBeGreaterThanOrEqual(4.5)
    }
    expect(dark.background).not.toBe(light.background)
    expect(dark.textColor).not.toBe(light.textColor)
  })

  test('filter and color popovers stay outside the modal contract', async ({ page }) => {
    await gotoDialogProbe(page)

    const styles = await page.evaluate(() => {
      const read = (selector: string) => {
        const style = getComputedStyle(document.querySelector(selector)!)
        return {
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          transform: style.transform,
        }
      }
      return {
        filter: read('.spreadsheet-filter-dropdown'),
        color: read('.spreadsheet-color-popover'),
        modal: read('.dialog-contract-probe'),
      }
    })

    expect(styles.modal.borderRadius).toBe('4px')
    expect(styles.modal.transform).not.toBe('none')
    expect(styles.filter.transform).toBe('none')
    expect(styles.color.transform).toBe('none')
    expect(styles.filter.boxShadow).not.toBe(styles.modal.boxShadow)
    expect(styles.color.boxShadow).not.toBe(styles.modal.boxShadow)
  })
})
