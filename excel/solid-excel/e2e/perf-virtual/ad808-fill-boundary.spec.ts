import { expect, test } from '@playwright/test'
import { gotoRoot } from '../helpers'

/**
 * AD-808/AD-809 shared seeding boundary — records how far the wire
 * protocol's non-atomic `direct` import can fill a headless WASM worker
 * workbook with the AD-806 pattern before the engine stops accepting
 * cells (observed as a WASM trap at this revision). This is a boundary
 * observation like AD-807/AD-810: it emits what actually happened and
 * makes no capacity, performance, or SLO claim in either direction.
 *
 * Gated: set AD808_FILL_BOUNDARY_ROWS (× 1,000 columns). 10000 requests
 * the full AD-806 ten-million-cell shape. Console/page-error guards are
 * deliberately absent — an engine trap surfaces as console errors that
 * are part of the observation, not a spec defect.
 */

const ROWS = Number(process.env.AD808_FILL_BOUNDARY_ROWS ?? Number.NaN)
const COLS = 1_000

test.describe('AD-808 direct-fill boundary observation', () => {
  test.skip(
    !Number.isInteger(ROWS) || ROWS < 1,
    'set AD808_FILL_BOUNDARY_ROWS (rows × 1000 cols of AD-806 fill)',
  )

  test('records where the direct-mode AD-806 fill settles or traps', async ({ page }) => {
    test.skip(test.info().project.name !== 'wasm', 'records the WASM worker engine boundary')
    test.setTimeout(15 * 60_000)
    await gotoRoot(page)

    const result = await page.evaluate(
      async ({ rows, cols }) => {
        const { createWorkerWorkbook } = await import('/src/adapter/worker-protocol.ts')
        const { defaultVNextWorkbookWorkerFactory } = await import(
          '/src/adapter/worker-factory.ts'
        )
        const workbook = createWorkerWorkbook({ workerFactory: defaultVNextWorkbookWorkerFactory })
        const startedMs = performance.now()
        let accepted = 0
        try {
          await workbook.initWorkbook(['AD808'])
          const chunkRows = Math.max(1, Math.floor(10_000 / cols))
          const session = await workbook.beginImport({ mode: 'direct' })
          for (let rowStart = 0; rowStart < rows; rowStart += chunkRows) {
            const rowEnd = Math.min(rows, rowStart + chunkRows)
            const chunk = []
            for (let row = rowStart; row < rowEnd; row += 1) {
              for (let col = 0; col < cols; col += 1) {
                chunk.push({ sheet: 0, row, col, kind: 'text', value: `r${row}c${col}` })
              }
            }
            accepted = await workbook.importChunk(session, chunk)
          }
          const stats = await workbook.commitImport(session)
          const counters = await workbook.debugCounters()
          const far = await workbook.readSparseRange({
            sheet: 0,
            startRow: rows - 1,
            startCol: cols - 1,
            endRow: rows - 1,
            endCol: cols - 1,
          })
          return {
            acceptedAtSettle: accepted,
            counters,
            elapsedMs: performance.now() - startedMs,
            error: null as string | null,
            farDisplay: far[0]?.display ?? '',
            outcome: 'completed' as const,
            stats,
          }
        } catch (error) {
          return {
            acceptedAtSettle: accepted,
            counters: null,
            elapsedMs: performance.now() - startedMs,
            error: error instanceof Error ? error.message : String(error),
            farDisplay: null,
            outcome: 'trapped' as const,
            stats: null,
          }
        } finally {
          workbook.dispose()
        }
      },
      { rows: ROWS, cols: COLS },
    )

    const observation = {
      fixture: {
        cols: COLS,
        requestedCellCount: ROWS * COLS,
        rows: ROWS,
        valuePattern: 'r{zero-based-row}c{zero-based-column}',
      },
      importMode: 'direct',
      chunkCells: 10_000,
      project: test.info().project.name,
      result,
      userAgent: await page.evaluate(() => navigator.userAgent),
    }
    console.info(`AD808_FILL_BOUNDARY_OBSERVATION ${JSON.stringify(observation)}`)

    if (result.outcome === 'completed') {
      expect(result.acceptedAtSettle).toBe(ROWS * COLS)
      expect(result.farDisplay).toBe(`r${ROWS - 1}c${COLS - 1}`)
    } else {
      // The boundary run records the last accepted cumulative count and
      // the raw error verbatim; it does not turn the trap into a pass
      // or fail verdict about capacity.
      expect(result.acceptedAtSettle).toBeGreaterThanOrEqual(0)
      expect(result.error ?? '').not.toBe('')
    }
  })
})
