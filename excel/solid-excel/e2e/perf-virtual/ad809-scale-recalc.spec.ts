import { expect, test } from '@playwright/test'
import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * AD-809 — recalculation observation on a filled-at-scale workbook:
 * an R-deep single dependency chain plus a whole-column `SUM(A:A)`
 * aggregate inside an R×1,000 AD-806-patterned fill (R = AD809_SCALE_ROWS;
 * 10000 = the ten-million-cell tier).
 *
 * Runs headless against the vNext WASM worker workbook (AD-826 pattern)
 * — recalculation happens in the worker, so no grid DOM is involved.
 * Wall-clock timings land in the emitted JSON only; the assertions pin
 * the demand-driven evaluation counts (AD-821 contract at scale).
 */

const SCALE_ROWS = Number(process.env.AD809_SCALE_ROWS ?? Number.NaN)
const SCALE_COLS = 1_000
const WINDOW_ROWS = 12

type Phase = {
  elapsedMs: number
  evalDelta: number
  [key: string]: unknown
}

type Measurement = {
  counters: { afterCommit: unknown; final: unknown }
  fixture: {
    chainLength: number
    cols: number
    formulaCount: number
    populatedCellCount: number
    rows: number
  }
  importStats: { accepted: number; errors: number; formulas: number; rejectedFormulas: number }
  phases: {
    chainRepeatRead: Phase
    chainTailAfterEdit: Phase
    chainTailFirstRead: Phase
    editA1: { elapsedMs: number; evalDelta: number }
    importElapsedMs: number
    sumAfterEdit: Phase & { display: string }
    windowRead: Phase & { cellCount: number }
  }
  userAgent: string
}

test.describe('AD-809 filled-at-scale recalculation observation', () => {
  test.skip(
    !Number.isInteger(SCALE_ROWS) || SCALE_ROWS < WINDOW_ROWS + 1,
    'set AD809_SCALE_ROWS (rows × 1000 cols; 10000 = ten-million tier)',
  )

  test('long-chain and whole-column recalc evaluate on demand only', async ({ page }) => {
    test.skip(test.info().project.name !== 'wasm', 'AD-809 records the WASM worker engine run')
    test.setTimeout(15 * 60_000)
    guardConsoleErrors(page)
    await gotoRoot(page)

    const measurement = await page.evaluate(
      async ({ rows, cols, windowRows }): Promise<Measurement> => {
        const { createWorkerWorkbook } = await import('/src/adapter/worker-protocol.ts')
        const { defaultVNextWorkbookWorkerFactory } = await import(
          '/src/adapter/worker-factory.ts'
        )
        const workbook = createWorkerWorkbook({ workerFactory: defaultVNextWorkbookWorkerFactory })

        const evalOf = (counters: unknown): number =>
          (counters as { formulaEvalCountTotal: number }).formulaEvalCountTotal

        // AD-806-patterned fill with two recalc probes carved in:
        //   col 0        → number 1 (every row)
        //   col 1        → B1 ﹦=A1, then B(r) ﹦=B(r-1)+A(r): R-deep chain
        //   col 2 row 0  → =SUM(A:A) whole-column aggregate
        //   elsewhere    → AD-806 text r{row}c{col}
        const cellAt = (row: number, col: number) => {
          if (col === 0) return { sheet: 0, row, col, kind: 'number', value: 1 }
          if (col === 1) {
            const formula = row === 0 ? '=A1' : `=B${row}+A${row + 1}`
            return { sheet: 0, row, col, kind: 'formula', value: formula }
          }
          if (col === 2 && row === 0) {
            return { sheet: 0, row, col, kind: 'formula', value: '=SUM(A:A)' }
          }
          return { sheet: 0, row, col, kind: 'text', value: `r${row}c${col}` }
        }

        try {
          await workbook.initWorkbook(['AD809'])
          const chunkRows = Math.max(1, Math.floor(10_000 / cols))
          const importStarted = performance.now()
          const session = await workbook.beginImport({ mode: 'direct' })
          for (let rowStart = 0; rowStart < rows; rowStart += chunkRows) {
            const rowEnd = Math.min(rows, rowStart + chunkRows)
            const chunk = []
            for (let row = rowStart; row < rowEnd; row += 1) {
              for (let col = 0; col < cols; col += 1) chunk.push(cellAt(row, col))
            }
            await workbook.importChunk(session, chunk)
          }
          const stats = await workbook.commitImport(session)
          const importElapsedMs = performance.now() - importStarted
          const afterCommit = await workbook.debugCounters()

          // Phase 1 — first-screen-like window read (rows 0..11, cols 0..3):
          // touches 12 chain formulas plus the whole-column SUM.
          let t0 = performance.now()
          const windowCells = await workbook.readSparseRange({
            sheet: 0,
            startRow: 0,
            startCol: 0,
            endRow: windowRows - 1,
            endCol: 3,
          })
          const windowElapsed = performance.now() - t0
          const afterWindow = await workbook.debugCounters()

          const readChainTail = async () => {
            const started = performance.now()
            const cells = await workbook.readSparseRange({
              sheet: 0,
              startRow: rows - 1,
              startCol: 1,
              endRow: rows - 1,
              endCol: 1,
            })
            return { display: cells[0]?.display ?? '', elapsedMs: performance.now() - started }
          }

          // Phase 2 — chain tail: forces the not-yet-evaluated remainder.
          const tailFirst = await readChainTail()
          const afterTail = await workbook.debugCounters()

          // Phase 3 — repeat read: memoized, no re-evaluation.
          const tailRepeat = await readChainTail()
          const afterRepeat = await workbook.debugCounters()

          // Phase 4 — edit the chain/aggregate root. The write command
          // itself synchronously re-derives already-materialized dirty
          // dependents, so the counters are sampled immediately after it.
          t0 = performance.now()
          const editOk = await workbook.setCell(0, 'A1', { type: 'number', value: 2 })
          const editElapsed = performance.now() - t0
          if (!editOk) throw new Error('AD-809 setCell(A1) was rejected')
          const afterEdit = await workbook.debugCounters()

          t0 = performance.now()
          const sumCells = await workbook.readSparseRange({
            sheet: 0,
            startRow: 0,
            startCol: 2,
            endRow: 0,
            endCol: 2,
          })
          const sumElapsed = performance.now() - t0
          const afterSum = await workbook.debugCounters()

          const tailAfterEdit = await readChainTail()
          const final = await workbook.debugCounters()

          return {
            counters: { afterCommit, final },
            fixture: {
              chainLength: rows,
              cols,
              formulaCount: rows + 1,
              populatedCellCount: rows * cols,
              rows,
            },
            importStats: {
              accepted: (stats as { accepted: number }).accepted,
              errors: (stats as { errors: number }).errors,
              formulas: (stats as { formulas: number }).formulas,
              rejectedFormulas: (stats as { rejectedFormulas: number }).rejectedFormulas,
            },
            phases: {
              chainRepeatRead: {
                display: tailRepeat.display,
                elapsedMs: tailRepeat.elapsedMs,
                evalDelta: evalOf(afterRepeat) - evalOf(afterTail),
              },
              chainTailAfterEdit: {
                display: tailAfterEdit.display,
                elapsedMs: tailAfterEdit.elapsedMs,
                evalDelta: evalOf(final) - evalOf(afterSum),
              },
              chainTailFirstRead: {
                display: tailFirst.display,
                elapsedMs: tailFirst.elapsedMs,
                evalDelta: evalOf(afterTail) - evalOf(afterWindow),
              },
              editA1: { elapsedMs: editElapsed, evalDelta: evalOf(afterEdit) - evalOf(afterRepeat) },
              importElapsedMs,
              sumAfterEdit: {
                display: sumCells[0]?.display ?? '',
                elapsedMs: sumElapsed,
                evalDelta: evalOf(afterSum) - evalOf(afterEdit),
              },
              windowRead: {
                cellCount: windowCells.length,
                elapsedMs: windowElapsed,
                evalDelta: evalOf(afterWindow) - evalOf(afterCommit),
              },
            },
            userAgent: navigator.userAgent,
          }
        } finally {
          workbook.dispose()
        }
      },
      { rows: SCALE_ROWS, cols: SCALE_COLS, windowRows: WINDOW_ROWS },
    )

    const populated = SCALE_ROWS * SCALE_COLS
    expect(measurement.importStats).toEqual({
      accepted: populated,
      errors: 0,
      formulas: SCALE_ROWS + 1,
      rejectedFormulas: 0,
    })
    // Import must not evaluate anything (lazy-until-read, AD-821).
    expect(measurement.counters.afterCommit).toMatchObject({
      formulaCount: SCALE_ROWS + 1,
      formulaEvalCountTotal: 0,
    })
    // Demand-driven eval counts: proportional to what each read visits.
    // Shallow window reads have an exact, parity-stable count; deep-chain
    // transitive evaluation is counted with engine-specific accounting
    // (the WASM engine ticks per transitive cell eval plus deep-chain
    // FAULT replays), so those phases pin O(chain-length) bounds and the
    // exact deltas land in the emitted JSON.
    expect(measurement.phases.windowRead.cellCount).toBe(WINDOW_ROWS * 4)
    expect(measurement.phases.windowRead.evalDelta).toBe(WINDOW_ROWS + 1)
    expect(measurement.phases.chainTailFirstRead.evalDelta).toBeGreaterThanOrEqual(
      SCALE_ROWS - WINDOW_ROWS,
    )
    expect(measurement.phases.chainTailFirstRead.evalDelta).toBeLessThanOrEqual(3 * SCALE_ROWS)
    expect(measurement.phases.chainTailFirstRead.display).toBe(String(SCALE_ROWS))
    expect(measurement.phases.chainRepeatRead.evalDelta).toBe(0)
    // After the A1 edit: the engine synchronously re-derives the
    // already-materialized dirty dependents inside the write command,
    // and the follow-up reads are memoized. The total post-edit
    // re-derive work covers the R-deep chain at least once and stays
    // O(R) — never O(populated).
    const postEditWork =
      measurement.phases.editA1.evalDelta +
      measurement.phases.sumAfterEdit.evalDelta +
      measurement.phases.chainTailAfterEdit.evalDelta
    expect(postEditWork).toBeGreaterThanOrEqual(SCALE_ROWS)
    expect(postEditWork).toBeLessThanOrEqual(3 * SCALE_ROWS + 2)
    expect(measurement.phases.sumAfterEdit.evalDelta).toBeLessThanOrEqual(1)
    expect(measurement.phases.sumAfterEdit.display).toBe(String(SCALE_ROWS + 1))
    expect(measurement.phases.chainTailAfterEdit.display).toBe(String(SCALE_ROWS + 1))
    // Cumulative evaluations stay far below the populated cell count.
    const finalEval = (measurement.counters.final as { formulaEvalCountTotal: number })
      .formulaEvalCountTotal
    expect(finalEval).toBeLessThan(populated / 100)

    console.info(`AD809_SCALE_RECALC_OBSERVATION ${JSON.stringify(measurement)}`)
    await expectNoConsoleErrors(page)
  })
})
