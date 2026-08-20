import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { cell, expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

const PROTECTION_UNLOCK_STYLE_URL = new URL(
  '../../../spreadsheet-ui-styles/features/protection-unlock-dialog.css',
  import.meta.url,
)

async function openUnlockDialog(page: Page) {
  await gotoRoot(page, 'locale=en')
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('menu-bar-button-format').click()
  await page.getByTestId('menu-bar-item-format.protectSheet').click()
  await cell(page, 'B4').click()
  await page.getByTestId('menu-bar-button-format').click()
  await page.getByTestId('menu-bar-item-format.unlockRange').click()
  await expect(page.getByTestId('vnext-worker-protection-unlock')).toBeVisible()
}

async function dialogMetrics(page: Page, theme: 'light' | 'dark') {
  return page.getByTestId('vnext-worker-protection-unlock').evaluate((dialog, nextTheme) => {
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
    const query = (selector: string) => dialog.querySelector<HTMLElement>(selector)!
    const input = query('[data-testid="protection-unlock-password"]')
    const primary = query('[data-testid="protection-unlock-confirm"]')
    const cancel = query('[data-testid="protection-unlock-cancel"]')
    input.focus()

    return {
      bodyBackground: getComputedStyle(query('.protection-unlock-body')).backgroundColor,
      controlHeights: [input, primary, cancel].map(
        (element) => element.getBoundingClientRect().height,
      ),
      focusColor: getComputedStyle(input).outlineColor,
      footerJustify: getComputedStyle(query('.protection-unlock-actions')).justifyContent,
      headerHeight: query('.protection-unlock-header').getBoundingClientRect().height,
      primaryBackground: getComputedStyle(primary).backgroundColor,
      targetBackground: getComputedStyle(query('.protection-unlock-target')).backgroundColor,
      tokens: {
        blue: resolveColor('--office-blue'),
        primary: resolveColor('--dialog-primary-bg'),
        secondarySurface: resolveColor('--bg-chrome-light'),
        surface: resolveColor('--bg-surface'),
      },
    }
  }, theme)
}

test.describe('Protection unlock Office web dialog', () => {
  test.beforeEach(({ page }) => guardConsoleErrors(page))

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('uses only chrome tokens and follows the modal contract in both themes', async ({
    page,
  }) => {
    const source = (await readFile(PROTECTION_UNLOCK_STYLE_URL, 'utf8')).replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    expect(source.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/gi) ?? []).toEqual([])

    await openUnlockDialog(page)
    const dialog = page.getByTestId('vnext-worker-protection-unlock')
    await expect(dialog).toHaveAttribute('data-lock-state', 'locked')
    await expect(dialog).toHaveAttribute('data-phase', 'editing')
    await expect(dialog).toHaveAttribute('aria-busy', 'false')

    const light = await dialogMetrics(page, 'light')
    const dark = await dialogMetrics(page, 'dark')
    for (const metrics of [light, dark]) {
      expect(metrics.bodyBackground).toBe(metrics.tokens.surface)
      expect(metrics.controlHeights).toEqual([28, 28, 28])
      expect(metrics.focusColor).toBe(metrics.tokens.blue)
      expect(metrics.footerJustify).toBe('flex-end')
      expect(metrics.headerHeight).toBe(40)
      expect(metrics.primaryBackground).toBe(metrics.tokens.primary)
      expect(metrics.targetBackground).toBe(metrics.tokens.secondarySurface)
    }
    expect(dark.bodyBackground).not.toBe(light.bodyBackground)
    expect(dark.focusColor).not.toBe(light.focusColor)
  })
})
