import { expect, test } from '@playwright/test'
import { cell, cellDisplay, expectNoConsoleErrors, gotoDemo, gotoRoot, guardConsoleErrors } from '../helpers'
import { anchorTo, samplePage } from './scale-observation'

/**
 * AD-812 — resident contracts distilled from the AD-807..AD-810 boundary
 * records and the AD-808/AD-809 scale observations. Only bounded,
 * revision-stable properties are pinned here — no wall-clock numbers:
 *
 *  1. Dense viewport windows (every visible cell populated) keep the DOM
 *     and the subscription set viewport-shaped across far-corner travel,
 *     and worker import sessions return to zero after commit.
 *  2. Formula evaluation counts track exactly what a read visits — a
 *     window read, a whole-column aggregate, and a deep chain evaluate
 *     on demand and memoize — independent of workbook population.
 */

const DOM_CELL_BOUND = 2_200
const SUBSCRIPTION_GROWTH_BOUND = 200

test.describe('AD-812 scale contracts', () => {
  test('dense far-corner travel keeps DOM and subscriptions viewport-bounded', async ({
    page,
  }) => {
    guardConsoleErrors(page)
    await gotoDemo(page, '1M Cells', 'debug=1')
    const ready = await samplePage(page)
    const baselineSubscriptions = ready.activeSubscriptionCount ?? -1
    expect(baselineSubscriptions).toBeGreaterThan(0)

    // Two dense 60×40 blocks — home and the far corner — through the
    // default atomic import session (4,800 cells, far below the
    // 200,000-cell session guard recorded by AD-810).
    const imported = await page.evaluate(async () => {
      const win = window as unknown as {
        __einfachWorkbookDebugClient?: {
          beginImport: () => Promise<number>
          importChunk: (sessionId: number, cells: unknown[]) => Promise<number>
          commitImport: (sessionId: number) => Promise<{ accepted: number; errors: number }>
        }
        __einfachWorkbookStore?: { refreshVisible?: () => void }
      }
      const client = win.__einfachWorkbookDebugClient
      if (!client) throw new Error('AD-812 requires the DemoMillion debug import client')
      const cells: unknown[] = []
      const denseBlock = (rowStart: number, colStart: number) => {
        for (let row = rowStart; row < rowStart + 60; row += 1) {
          for (let col = colStart; col < colStart + 40; col += 1) {
            cells.push({ sheet: 0, row, col, kind: 'text', value: `r${row}c${col}` })
          }
        }
      }
      denseBlock(0, 0)
      denseBlock(940, 960)
      const session = await client.beginImport()
      for (let start = 0; start < cells.length; start += 1_000) {
        await client.importChunk(session, cells.slice(start, start + 1_000))
      }
      const stats = await client.commitImport(session)
      win.__einfachWorkbookStore?.refreshVisible?.()
      return stats
    })
    expect(imported.accepted).toBe(4_800)
    expect(imported.errors).toBe(0)
    await expect(cellDisplay(page, 'A1')).toHaveText('r0c0')

    // Far-corner jump into the dense block: DOM stays viewport-shaped.
    await anchorTo(page, 999, 999)
    await expect(cellDisplay(page, 'ALL1000')).toHaveText('r999c999')
    const atCorner = await samplePage(page)
    expect(atCorner.dom.cellElements).toBeGreaterThan(0)
    expect(atCorner.dom.cellElements).toBeLessThan(DOM_CELL_BOUND)
    expect(await cell(page, 'A1').count()).toBe(0)

    // Round trip home: the corner window unmounts, A1 rehydrates.
    await anchorTo(page, 0, 0)
    await expect(cellDisplay(page, 'A1')).toHaveText('r0c0')
    await expect(cell(page, 'ALL1000')).toHaveCount(0)
    const atHome = await samplePage(page)
    expect(atHome.dom.cellElements).toBeLessThan(DOM_CELL_BOUND)

    // Subscriptions track the live viewport, not the travel history.
    for (const sample of [atCorner, atHome]) {
      const subs = sample.activeSubscriptionCount ?? -1
      expect(subs - baselineSubscriptions).toBeLessThan(SUBSCRIPTION_GROWTH_BOUND)
    }
    // Import sessions do not linger after commit (AD-807/AD-810 fact).
    expect(
      (atHome.workerCounters as { importSessionCount?: number } | null)?.importSessionCount,
    ).toBe(0)
    await expectNoConsoleErrors(page)
  })

  test('formula evaluation counts track the visited range, not the workbook', async ({ page }) => {
    guardConsoleErrors(page)
    await gotoRoot(page)

    const ROWS = 512
    const WINDOW_ROWS = 12
    const result = await page.evaluate(
      async ({ rows, windowRows }) => {
        const requested = new URLSearchParams(window.location.search).get('backend')
        if (requested !== 'ts' && requested !== 'wasm') {
          throw new Error(`AD-812 requires a ts or wasm backend, received ${requested}`)
        }
        const { createWorkerWorkbook } = await import('/src-vnext/adapter/worker-protocol.ts')
        const { defaultExcelCoreTsWorkerFactory, defaultVNextWorkbookWorkerFactory } = await import(
          '/src-vnext/adapter/worker-factory.ts'
        )
        const workbook = createWorkerWorkbook({
          workerFactory:
            requested === 'ts' ? defaultExcelCoreTsWorkerFactory : defaultVNextWorkbookWorkerFactory,
        })
        const evalOf = (counters: unknown): number =>
          (counters as { formulaEvalCountTotal: number }).formulaEvalCountTotal

        try {
          await workbook.initWorkbook(['AD812'])
          // Column A: numbers. Column B: R-deep chain. C1: whole-column
          // SUM. Columns D..W: value filler so the populated count sits
          // far above any O(chain) evaluation bound — the load-bearing
          // separation between "work tracks the visited chain" and
          // "work tracks the workbook population".
          const cells = []
          for (let row = 0; row < rows; row += 1) {
            cells.push({ sheet: 0, row, col: 0, kind: 'number', value: 1 })
            cells.push({
              sheet: 0,
              row,
              col: 1,
              kind: 'formula',
              value: row === 0 ? '=A1' : `=B${row}+A${row + 1}`,
            })
            for (let col = 3; col < 23; col += 1) {
              cells.push({ sheet: 0, row, col, kind: 'text', value: `r${row}c${col}` })
            }
          }
          cells.push({ sheet: 0, row: 0, col: 2, kind: 'formula', value: '=SUM(A:A)' })
          const session = await workbook.beginImport()
          for (let start = 0; start < cells.length; start += 10_000) {
            await workbook.importChunk(session, cells.slice(start, start + 10_000))
          }
          await workbook.commitImport(session)

          const afterCommit = await workbook.debugCounters()
          const windowCells = await workbook.readSparseRange({
            sheet: 0,
            startRow: 0,
            startCol: 0,
            endRow: windowRows - 1,
            endCol: 2,
          })
          const afterWindow = await workbook.debugCounters()
          const tail = await workbook.readSparseRange({
            sheet: 0,
            startRow: rows - 1,
            startCol: 1,
            endRow: rows - 1,
            endCol: 1,
          })
          const afterTail = await workbook.debugCounters()
          await workbook.readSparseRange({
            sheet: 0,
            startRow: rows - 1,
            startCol: 1,
            endRow: rows - 1,
            endCol: 1,
          })
          const afterRepeat = await workbook.debugCounters()

          return {
            backend: requested,
            evalAfterCommit: evalOf(afterCommit),
            formulaCount: (afterCommit as { formulaCount: number }).formulaCount,
            importSessionCount: (afterRepeat as { importSessionCount: number }).importSessionCount,
            populatedCellCount: cells.length,
            repeatDelta: evalOf(afterRepeat) - evalOf(afterTail),
            tailDelta: evalOf(afterTail) - evalOf(afterWindow),
            tailDisplay: tail[0]?.display ?? '',
            windowCellCount: windowCells.length,
            windowDelta: evalOf(afterWindow) - evalOf(afterCommit),
          }
        } finally {
          workbook.dispose()
        }
      },
      { rows: ROWS, windowRows: WINDOW_ROWS },
    )

    // Import stays lazy; the workbook holds R+1 formulas.
    expect(result.evalAfterCommit).toBe(0)
    expect(result.formulaCount).toBe(ROWS + 1)
    expect(result.populatedCellCount).toBe(ROWS * 22 + 1)
    // A 12-row window visits 12 chain formulas + the whole-column SUM —
    // nothing else, although the workbook holds 513 formulas. This exact
    // count is parity-stable across both worker engines (AD-826/AD-809).
    expect(result.windowCellCount).toBe(WINDOW_ROWS * 2 + 1)
    expect(result.windowDelta).toBe(WINDOW_ROWS + 1)
    // Chain-tail evaluation work is O(chain length), never O(populated
    // cells). The exact counter delta is engine-specific accounting
    // (the WASM engine ticks per transitive cell eval plus deep-chain
    // FAULT replays; the TS engine ticks top-level derive runs — both
    // deterministic, recorded in the AD-809 observation), so the pinned
    // contract is the bound, not the number.
    expect(result.tailDelta).toBeGreaterThanOrEqual(1)
    expect(result.tailDelta).toBeLessThanOrEqual(3 * ROWS)
    expect(result.tailDelta).toBeLessThan(result.populatedCellCount / 4)
    expect(result.tailDisplay).toBe(String(ROWS))
    // … and a repeated read is fully memoized.
    expect(result.repeatDelta).toBe(0)
    expect(result.importSessionCount).toBe(0)
    await expectNoConsoleErrors(page)
  })
})
