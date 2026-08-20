import { expect, test } from '@playwright/test'

import { expectNoConsoleErrors } from '../helpers'
import { MODAL_SURFACES } from './dialog-inventory'
import { gotoDialogMatrix, mountModalProbe, readModalMetrics } from './dialog-matrix-fixture'

test.describe('Office web modal visual matrix', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  for (const surface of MODAL_SURFACES) {
    test(`${surface.id} ${surface.name} preserves the light/dark D00 contract`, async ({
      page,
    }) => {
      await gotoDialogMatrix(page)
      await mountModalProbe(page, surface)

      const light = await readModalMetrics(page, 'light')
      const dark = await readModalMetrics(page, 'dark')
      for (const [theme, metrics] of [
        ['light', light],
        ['dark', dark],
      ] as const) {
        const label = `${surface.id} ${theme}`
        expect(metrics.width, `${label}: feature width rule must be loaded`).toBe(
          surface.expectedWidth,
        )
        expect(metrics.background, `${label}: surface token`).toBe(metrics.tokens.surface)
        expect(metrics.borderColor, `${label}: border token`).toBe(metrics.tokens.border)
        expect(metrics.borderRadius, `${label}: 4px modal radius`).toBe('4px')
        expect(metrics.borderWidth, `${label}: one-pixel border`).toBe('1px')
        expect(metrics.headerHeight, `${label}: compact title bar`).toBe(40)
        expect(metrics.controlHeights, `${label}: 28px controls`).toEqual(
          Array(metrics.controlHeights.length).fill(28),
        )
        expect(metrics.footerJustify, `${label}: right-aligned actions`).toBe('flex-end')
        expect(metrics.focusColor, `${label}: Office-blue focus`).toBe(metrics.tokens.focus)
        expect(metrics.focusWidth, `${label}: visible focus width`).toBe('2px')
        expect(metrics.fontFamily, `${label}: Office typography`).toContain('Segoe UI')
        expect(metrics.textColor, `${label}: text token`).toBe(metrics.tokens.text)
        expect(metrics.textContrast, `${label}: readable body copy`).toBeGreaterThanOrEqual(4.5)
        if (surface.hasPrimary !== false) {
          expect(metrics.primaryBackground, `${label}: Excel-green primary`).toBe(
            metrics.tokens.primary,
          )
          expect(metrics.primaryContrast, `${label}: readable primary copy`).toBeGreaterThanOrEqual(
            4.5,
          )
        } else {
          expect(metrics.primaryBackground, `${label}: no invented primary action`).toBeNull()
        }

        if (surface.anchored) {
          expect(metrics.transform, `${label}: anchored workflow stays anchored`).toBe('none')
          expect(metrics.shadow, `${label}: anchored workflow avoids modal overlay`).not.toContain(
            metrics.tokens.overlay,
          )
        } else {
          expect(metrics.transform, `${label}: modal centering transform`).not.toBe('none')
          expect(metrics.centerOffset, `${label}: centered modal`).toBeLessThanOrEqual(1)
          expect(metrics.shadow, `${label}: modal overlay token`).toContain(metrics.tokens.overlay)
        }
      }

      expect(dark.background, `${surface.id}: theme surface changes`).not.toBe(light.background)
      expect(dark.textColor, `${surface.id}: theme text changes`).not.toBe(light.textColor)
    })
  }
})
