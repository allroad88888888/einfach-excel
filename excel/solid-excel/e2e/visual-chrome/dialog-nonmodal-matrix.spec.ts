import { expect, test, type Locator, type Page } from '@playwright/test'

import { cell, expectNoConsoleErrors } from '../helpers'
import { gotoDialogMatrix } from './dialog-matrix-fixture'

async function readPopoverMetrics(
  surface: Locator,
  theme: 'light' | 'dark',
  anchorTestId: string,
  controlSelector: string,
) {
  return surface.evaluate(
    (root, args) => {
      const host = root.closest<HTMLElement>('.vnext-demo, .demo-page')!
      if (args.theme === 'dark') host.dataset.spreadsheetTheme = 'dark'
      else delete host.dataset.spreadsheetTheme

      const resolveStyle = (
        property: 'backgroundColor' | 'borderRadius' | 'boxShadow',
        value: string,
      ) => {
        const sample = document.createElement('span')
        sample.style[property] = value
        root.append(sample)
        const resolved = getComputedStyle(sample)[property]
        sample.remove()
        return resolved
      }
      const resolveColor = (token: string) => resolveStyle('backgroundColor', `var(${token})`)
      const anchor = document.querySelector<HTMLElement>(`[data-testid="${args.anchorTestId}"]`)!
      const anchorRect = anchor.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      const controls = [...root.querySelectorAll<HTMLElement>(args.controlSelector)]
      const primary = root.querySelector<HTMLElement>(
        '[data-variant="primary"], .filter-btn-primary',
      )
      const style = getComputedStyle(root)
      return {
        anchorGap: Math.round(rootRect.top - anchorRect.bottom),
        ariaModal: root.getAttribute('aria-modal'),
        background: style.backgroundColor,
        borderRadius: style.borderRadius,
        centerOffset: Math.abs(rootRect.left + rootRect.width / 2 - innerWidth / 2),
        controlHeights: controls.map((control) =>
          Math.round(control.getBoundingClientRect().height),
        ),
        position: style.position,
        primaryBackground: primary ? getComputedStyle(primary).backgroundColor : null,
        shadow: style.boxShadow,
        rightInset: Math.round(innerWidth - rootRect.right),
        rightInsetToken: Math.round(Math.max(24, (innerWidth - 1280) / 2 + 40)),
        tokens: {
          overlay: resolveColor('--dialog-overlay'),
          primary: resolveColor('--dialog-primary-bg'),
          radius: resolveStyle('borderRadius', 'var(--radius)'),
          shadow: resolveStyle('boxShadow', 'var(--shadow-popover)'),
          surface: resolveColor('--bg-surface'),
        },
        transform: style.transform,
        top: Math.round(rootRect.top),
        viewportContained:
          rootRect.left >= 0 &&
          rootRect.top >= 0 &&
          rootRect.right <= innerWidth &&
          rootRect.bottom <= innerHeight,
        width: Math.round(rootRect.width),
      }
    },
    { anchorTestId, controlSelector, theme },
  )
}

async function openFilterDropdown(page: Page) {
  await page.locator('.spreadsheet-grid-col-header[data-col="1"]').click()
  const anchor = page.getByTestId('toolbar-btn-filter')
  await expect(anchor).toBeEnabled()
  await anchor.click()
  const surface = page.getByTestId('wave5-filter-dropdown')
  await expect(surface).toBeVisible()
  return surface
}

async function openColorPopover(page: Page) {
  await cell(page, 'B2').click()
  const anchor = page.getByTestId('toolbar-btn-fill-color')
  await expect(anchor).toBeEnabled()
  await anchor.click()
  const surface = page.getByTestId('toolbar-color-popover')
  await expect(surface).toBeVisible()
  return surface
}

test.describe('Office web nonmodal dialog boundaries', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('D18 mounted Filter Dropdown retains nonmodal popover geometry in both themes', async ({
    page,
  }) => {
    await gotoDialogMatrix(page)
    const surface = await openFilterDropdown(page)
    await expect(surface).not.toHaveAttribute('aria-modal', 'true')

    const light = await readPopoverMetrics(
      surface,
      'light',
      'toolbar-btn-filter',
      '.filter-btn, .filter-search-input, .filter-condition-input, .filter-condition-select',
    )
    const dark = await readPopoverMetrics(
      surface,
      'dark',
      'toolbar-btn-filter',
      '.filter-btn, .filter-search-input, .filter-condition-input, .filter-condition-select',
    )
    for (const metrics of [light, dark]) {
      expect(metrics.ariaModal).toBeNull()
      expect(metrics.position).toBe('fixed')
      expect(metrics.transform).toBe('none')
      expect(metrics.width).toBe(320)
      expect(metrics.centerOffset).toBeGreaterThan(100)
      expect(metrics.top).toBe(220)
      expect(metrics.rightInset).toBe(metrics.rightInsetToken)
      expect(metrics.viewportContained).toBe(true)
      expect(metrics.background).toBe(metrics.tokens.surface)
      expect(metrics.borderRadius).toBe(metrics.tokens.radius)
      expect(metrics.shadow).toBe(metrics.tokens.shadow)
      expect(metrics.shadow).not.toContain(metrics.tokens.overlay)
      expect(metrics.controlHeights).toEqual(Array(metrics.controlHeights.length).fill(28))
      expect(metrics.primaryBackground).toBe(metrics.tokens.primary)
    }
    expect(dark.background).not.toBe(light.background)
  })

  test('D19 mounted color picker stays anchored and excluded from modal geometry', async ({
    page,
  }) => {
    await gotoDialogMatrix(page)
    const surface = await openColorPopover(page)
    await expect(surface).toHaveAttribute('aria-modal', 'false')

    const selector = [
      '.spreadsheet-color-popover-no-fill',
      '.spreadsheet-color-popover-swatch',
      '.spreadsheet-color-popover-more',
    ].join(', ')
    const light = await readPopoverMetrics(surface, 'light', 'toolbar-btn-fill-color', selector)
    const dark = await readPopoverMetrics(surface, 'dark', 'toolbar-btn-fill-color', selector)
    for (const metrics of [light, dark]) {
      expect(metrics.ariaModal).toBe('false')
      expect(metrics.position).toBe('fixed')
      expect(metrics.transform).toBe('none')
      expect(metrics.width).toBe(226)
      expect(metrics.anchorGap).toBeGreaterThanOrEqual(0)
      expect(metrics.anchorGap).toBeLessThanOrEqual(8)
      expect(metrics.viewportContained).toBe(true)
      expect(metrics.background).toBe(metrics.tokens.surface)
      expect(metrics.borderRadius).toBe(metrics.tokens.radius)
      expect(metrics.shadow).toBe(metrics.tokens.shadow)
      expect(metrics.shadow).not.toContain(metrics.tokens.overlay)
      expect(metrics.controlHeights).toEqual(Array(metrics.controlHeights.length).fill(28))
    }
    expect(dark.background).not.toBe(light.background)
  })
})
