import { test, expect, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  gotoDemo,
  gotoRoot,
  guardConsoleErrors,
} from '../helpers'

/**
 * First-screen console.error sweep — every demo tab in App.tsx.
 *
 * Plan: docs/E2E_FEATURE_FOLDER_PLAN_2026-07-29.md §3 row 1 ("首屏错误守卫
 * 全 demo 扫一遍"). Each test opens one demo, waits until its first screen
 * has demonstrably settled — a computed signature cell where the demo has
 * one, because that is the moment async worker/wasm boot errors would have
 * surfaced — then asserts the console.error guard stayed clean.
 *
 * The demo list mirrors `App.tsx::demoGroups` (14 tabs). If a demo is
 * added or renamed there this sweep must follow; the sweep failing on a
 * missing nav button is the intended signal.
 */

type DemoEntry = {
  /** Exact EN nav label (src/i18n/locales/en.ts `nav.*`). */
  name: string
  /** Settle condition beyond gotoDemo's A1-visible wait. */
  settled: (page: Page) => Promise<void>
}

const T = { timeout: 30_000 }

const DEMOS: DemoEntry[] = [
  {
    // JS mock sheet — empty grid, A1 visible is the whole first screen.
    name: 'Blank',
    settled: async (page) => {
      await expect(cell(page, 'A1')).toBeVisible(T)
    },
  },
  {
    // WASM sheet: C3 = A3+B3 = 13 proves the engine evaluated the seed.
    name: 'Formulas',
    settled: async (page) => {
      await expect(cellDisplay(page, 'C3')).toHaveText('13', T)
    },
  },
  {
    // B5 = SUM(B3,B4) = 10000 — first computed total in the seed.
    name: 'Budget',
    settled: async (page) => {
      await expect(cellDisplay(page, 'B5')).toHaveText('10000', T)
    },
  },
  {
    // B11 = class average over 8 students = 79.125.
    name: 'Grade Calc',
    settled: async (page) => {
      await expect(cellDisplay(page, 'B11')).toHaveText('79.125', T)
    },
  },
  {
    // E8 = grand total = 93200 — the deepest seed aggregate.
    name: 'Sales Dashboard',
    settled: async (page) => {
      await expect(cellDisplay(page, 'E8')).toHaveText('93200', T)
    },
  },
  {
    // Worker-workbook demo with tabs Sheet1 / Expenses / Notes.
    name: 'Multi-Sheet',
    settled: async (page) => {
      await expect(page.getByRole('tab', { name: 'Expenses', exact: true })).toBeVisible(T)
      await expect(cell(page, 'A1')).toBeVisible(T)
    },
  },
  {
    // Lazy cross-sheet chain — the cache badge mounts once the workbook loads.
    name: '3-Sheet Chain',
    settled: async (page) => {
      await expect(page.locator('[data-cache-state="Sheet2!C5"]')).toBeVisible(T)
    },
  },
  {
    // Column chain A3..A50 over wasm: A10 = A9+1 = 9.
    name: 'Large Grid',
    settled: async (page) => {
      await expect(cellDisplay(page, 'A10')).toHaveText('9', T)
    },
  },
  {
    // wasm-sheet worker: D2 = B2*C2 = 4.5 round-trips through postMessage.
    name: 'Worker',
    settled: async (page) => {
      await expect(cellDisplay(page, 'D2')).toHaveText('4.5', T)
    },
  },
  {
    // Sparse 1000×1000 workbook seeded through the worker; A2 = A1+1 = 2.
    name: '1M Cells',
    settled: async (page) => {
      await expect(cellDisplay(page, 'A2')).toHaveText('2', T)
    },
  },
  {
    // vNext static projection demo — status bar flips to Ready once the
    // visible-window projection resolves.
    name: 'vNext',
    settled: async (page) => {
      await expect(page.getByTestId('vnext-grid')).toBeVisible(T)
      await expect(page.getByTestId('status-projection')).toHaveText('Ready', T)
    },
  },
  {
    // vNext worker demo (wasm or ts runtime per project): C2 = 13 seed.
    name: 'vNext Worker',
    settled: async (page) => {
      await expect(page.getByTestId('vnext-worker-grid')).toBeVisible(T)
      await expect(cellDisplay(page, 'C2')).toHaveText('13', T)
    },
  },
  {
    // Always the TS core runtime: B5 = SUM(B2:B4) = 60.
    name: 'Worker (TS core)',
    settled: async (page) => {
      await expect(page.getByTestId('vnext-worker-ts-grid')).toBeVisible(T)
      await expect(cellDisplay(page, 'B5')).toHaveText('60', T)
    },
  },
  {
    // Wave 5 full demo on the static backend: A1 header cell "Region".
    name: 'vNext Wave 5',
    settled: async (page) => {
      await expect(page.getByTestId('wave5-grid')).toBeVisible(T)
      await expect(cellDisplay(page, 'A1')).toHaveText('Region', T)
    },
  },
]

test.describe('Demo first-screen console guard', () => {
  for (const demo of DEMOS) {
    test(`${demo.name} first screen boots without console errors`, async ({ page }) => {
      guardConsoleErrors(page)
      await gotoDemo(page, demo.name)
      await demo.settled(page)
      await expectNoConsoleErrors(page)
    })
  }

  test('default boot (no nav, zh locale) reaches Wave 5 without console errors', async ({
    page,
  }) => {
    // The app boots locale=zh straight into the Wave 5 tab (commit dede42a).
    // This is the one sweep entry that must NOT force locale=en — it guards
    // the literal cold-boot path every visitor hits.
    guardConsoleErrors(page)
    await gotoRoot(page)
    await expect(page.getByTestId('nav-tab-vnext-wave5')).toHaveClass(/tab-active/)
    await expect(page.getByTestId('wave5-grid')).toBeVisible(T)
    await expect(cellDisplay(page, 'A1')).toHaveText('Region', T)
    await expectNoConsoleErrors(page)
  })
})
