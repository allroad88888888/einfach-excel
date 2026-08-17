import { expect, test, type Page } from '@playwright/test'
import { cellDisplay, cell, expectNoConsoleErrors, gotoDemo, guardConsoleErrors } from '../helpers'
import {
  anchorTo,
  cellAddr,
  samplePage,
  seedAd806DirectImport,
  type PageScaleSample,
} from './scale-observation'

/**
 * AD-808 — filled-at-scale interaction observation on the live DemoMillion
 * surface (grid override `?rows=…`). The workbook is seeded with the
 * AD-806 deterministic fill through the wire protocol's non-atomic
 * `direct` import mode (the atomic 200,000-cell guard recorded by
 * AD-807/AD-810 applies to atomic sessions only, and stays untouched).
 *
 * Gated: set AD808_SCALE_ROWS (e.g. 10000 for the full 10,000×1,000 =
 * ten-million-cell tier). Wall-clock timings land in the emitted JSON
 * observation only — the assertions pin bounded, revision-stable
 * properties (DOM cells, subscription growth, projection correctness).
 */

const SCALE_ROWS = Number(process.env.AD808_SCALE_ROWS ?? Number.NaN)
const SCALE_COLS = 1_000
const DOM_CELL_BOUND = 2_200
const SUBSCRIPTION_GROWTH_BOUND = 200

type TravelSample = {
  addr: string
  col: number
  elapsedMs: number
  row: number
  sample: PageScaleSample
}

async function travelAndSample(page: Page, row: number, col: number): Promise<TravelSample> {
  const addr = cellAddr(row, col)
  const startedMs = Date.now()
  await anchorTo(page, row, col)
  await expect(cellDisplay(page, addr)).toHaveText(`r${row}c${col}`, { timeout: 30_000 })
  const elapsedMs = Date.now() - startedMs
  return { addr, col, elapsedMs, row, sample: await samplePage(page) }
}

test.describe('AD-808 filled-at-scale interaction observation', () => {
  test.skip(
    !Number.isInteger(SCALE_ROWS) || SCALE_ROWS < 1,
    'set AD808_SCALE_ROWS (rows × 1000 cols of AD-806 fill; 10000 = ten-million tier)',
  )

  test('scroll ladder, far-corner jump, and full-grid selection stay bounded', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'wasm', 'AD-808 records the DemoMillion WASM worker run')
    test.setTimeout(15 * 60_000)
    guardConsoleErrors(page)

    await gotoDemo(page, '1M Cells', `debug=1&rows=${SCALE_ROWS}&cols=${SCALE_COLS}`)
    const ready = await samplePage(page)
    const baselineSubscriptions = ready.activeSubscriptionCount ?? -1
    expect(baselineSubscriptions).toBeGreaterThan(0)

    // ---- Seed: AD-806 deterministic fill via direct-mode import ----
    const seed = await seedAd806DirectImport(page, SCALE_ROWS, SCALE_COLS)
    expect(seed.accepted).toBe(SCALE_ROWS * SCALE_COLS)
    await expect(cellDisplay(page, 'A1')).toHaveText('r0c0', { timeout: 60_000 })
    const afterSeed = await samplePage(page)

    // ---- Continuous viewport travel down the row axis ----
    const ladderRows = [
      Math.floor(SCALE_ROWS * 0.05),
      Math.floor(SCALE_ROWS * 0.15),
      Math.floor(SCALE_ROWS * 0.3),
      Math.floor(SCALE_ROWS * 0.5),
      Math.floor(SCALE_ROWS * 0.7),
      Math.floor(SCALE_ROWS * 0.85),
      SCALE_ROWS - 1,
    ]
    const ladder: TravelSample[] = []
    for (const row of ladderRows) {
      const step = await travelAndSample(page, row, 5)
      expect(step.sample.dom.cellElements).toBeGreaterThan(0)
      expect(step.sample.dom.cellElements).toBeLessThan(DOM_CELL_BOUND)
      ladder.push(step)
    }

    // ---- Far-corner jump (Ctrl+End-like: home → last filled cell) ----
    await travelAndSample(page, 0, 0)
    const cornerRow = SCALE_ROWS - 1
    const cornerCol = SCALE_COLS - 1
    const corner = await travelAndSample(page, cornerRow, cornerCol)
    expect(corner.sample.dom.cellElements).toBeLessThan(DOM_CELL_BOUND)
    // Projection correctness inside the far window: neighbours carry the
    // deterministic AD-806 values for their own coordinates.
    await expect(cellDisplay(page, cellAddr(cornerRow - 1, cornerCol - 1))).toHaveText(
      `r${cornerRow - 1}c${cornerCol - 1}`,
    )
    await expect(cellDisplay(page, cellAddr(cornerRow - 2, cornerCol))).toHaveText(
      `r${cornerRow - 2}c${cornerCol}`,
    )
    expect(await cell(page, 'A1').count()).toBe(0)

    // ---- Round trip home: corner window unmounts, A1 rehydrates ----
    const home = await travelAndSample(page, 0, 0)
    expect(await cell(page, corner.addr).count()).toBe(0)
    expect(home.sample.dom.cellElements).toBeLessThan(DOM_CELL_BOUND)

    // ---- Full-grid selection must not materialize addresses ----
    const selection = await page.evaluate(
      ({ rows, cols }) => {
        const win = window as unknown as {
          __einfachStore?: {
            setSelectionAnchor: (coord: { row: number; col: number }) => void
            extendSelection: (coord: { row: number; col: number }) => void
            selectionAddrs: () => string[][] | null
          }
        }
        const store = win.__einfachStore
        if (!store) throw new Error('AD-808 requires the debug store')
        const startedMs = performance.now()
        store.setSelectionAnchor({ row: 0, col: 0 })
        store.extendSelection({ row: rows - 1, col: cols - 1 })
        const addrs = store.selectionAddrs()
        return { addrs, elapsedMs: performance.now() - startedMs }
      },
      { rows: SCALE_ROWS, cols: SCALE_COLS },
    )
    expect(selection.addrs).toBeNull()
    const afterSelection = await samplePage(page)
    expect(afterSelection.dom.cellElements).toBeLessThan(DOM_CELL_BOUND)

    // ---- Bounded-growth + zero-eval invariants across the whole run ----
    const finalSubscriptions = afterSelection.activeSubscriptionCount ?? -1
    expect(finalSubscriptions - baselineSubscriptions).toBeLessThan(SUBSCRIPTION_GROWTH_BOUND)
    for (const step of ladder) {
      const subs = step.sample.activeSubscriptionCount ?? -1
      expect(subs - baselineSubscriptions).toBeLessThan(SUBSCRIPTION_GROWTH_BOUND)
    }
    const evalOf = (sample: PageScaleSample) =>
      (sample.workerCounters as { formulaEvalCountTotal?: number } | null)
        ?.formulaEvalCountTotal ?? null
    // The AD-806 fill holds no formulas, so pure-value browsing must not
    // add a single formula evaluation after the seed lands.
    expect(evalOf(afterSelection)).toBe(evalOf(afterSeed))

    const observation = {
      fixture: {
        cols: SCALE_COLS,
        populatedCellCount: SCALE_ROWS * SCALE_COLS,
        rows: SCALE_ROWS,
        valuePattern: 'r{zero-based-row}c{zero-based-column}',
      },
      grid: { cols: SCALE_COLS, rows: SCALE_ROWS },
      phases: {
        corner,
        home,
        ladder,
        ready,
        seed: { ...seed, afterSeedSample: afterSeed },
        selection: { ...selection, afterSelectionSample: afterSelection },
      },
      project: test.info().project.name,
      userAgent: await page.evaluate(() => navigator.userAgent),
      warmupRuns: [],
    }
    console.info(`AD808_SCALE_INTERACTION_OBSERVATION ${JSON.stringify(observation)}`)
    await expectNoConsoleErrors(page)
  })
})
