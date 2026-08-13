import { expect, test } from '@playwright/test'
import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

type DebugCounters = {
  formulaCount: number
  formulaEvalCountTotal: number
}

type FirstScreenMeasurement = {
  backend: string
  commit: {
    accepted: number
    errors: number
    formulas: number
    rejectedFormulas: number
  }
  fixture: {
    populatedCellCount: number
    rows: number
    shallowFormulaCount: number
  }
  firstScreen: {
    cellCount: number
    range: { endCol: number; endRow: number; sheet: number; startCol: number; startRow: number }
    sampleDisplays: string[]
  }
  counters: {
    afterFirstScreenRead: DebugCounters
    beforeFirstScreenRead: DebugCounters
  }
  userAgent: string
}

const FIXTURE_ROWS = 24
const FIRST_SCREEN_ROWS = 12
const FIRST_SCREEN_RANGE = {
  sheet: 0,
  startRow: 0,
  startCol: 0,
  endRow: FIRST_SCREEN_ROWS - 1,
  endCol: 3,
}

function shallowFormulaFixture() {
  const cells: Array<{
    col: number
    kind: 'formula' | 'number' | 'text'
    row: number
    sheet: number
    value: number | string
  }> = []
  for (let row = 0; row < FIXTURE_ROWS; row += 1) {
    const rowNumber = row + 1
    cells.push({ sheet: 0, row, col: 0, kind: 'number', value: rowNumber })
    cells.push({ sheet: 0, row, col: 1, kind: 'formula', value: `=A${rowNumber}+1` })
    cells.push({ sheet: 0, row, col: 2, kind: 'text', value: `row-${rowNumber}` })
    cells.push({ sheet: 0, row, col: 3, kind: 'formula', value: `=A${rowNumber}+2` })
  }
  return cells
}

test.describe('AD-826 first-screen formula evaluation observation', () => {
  test('records only the shallow formulas visited by the first-screen projection', async ({
    page,
  }) => {
    guardConsoleErrors(page)
    await gotoRoot(page)

    const fixture = shallowFormulaFixture()
    const measurement = await page.evaluate(
      async ({ fixtureCells, firstScreenRange }): Promise<FirstScreenMeasurement> => {
        const { createWorkerWorkbook } = await import('/src/wasm-workbook-proxy.ts')
        const { defaultWorkbookWorkerFactory } = await import(
          '/src/wasm-workbook-worker-factory.ts'
        )
        const workbook = createWorkerWorkbook({ workerFactory: defaultWorkbookWorkerFactory })
        try {
          await workbook.initWorkbook(['AD826'])
          const session = await workbook.beginImport()
          await workbook.importChunk(session, fixtureCells)
          const commit = await workbook.commitImport(session)
          const beforeFirstScreenRead = await workbook.debugCounters()
          const projection = await workbook.readSparseRange(firstScreenRange)
          const afterFirstScreenRead = await workbook.debugCounters()

          return {
            backend: new URLSearchParams(window.location.search).get('backend') ?? 'default',
            commit: {
              accepted: commit.accepted,
              errors: commit.errors,
              formulas: commit.formulas,
              rejectedFormulas: commit.rejectedFormulas,
            },
            fixture: {
              populatedCellCount: fixtureCells.length,
              rows: 24,
              shallowFormulaCount: fixtureCells.filter((cell) => cell.kind === 'formula').length,
            },
            firstScreen: {
              cellCount: projection.length,
              range: firstScreenRange,
              sampleDisplays: projection
                .filter((cell) => cell.formula !== '')
                .slice(0, 4)
                .map((cell) => cell.display),
            },
            counters: { beforeFirstScreenRead, afterFirstScreenRead },
            userAgent: navigator.userAgent,
          }
        } finally {
          workbook.dispose()
        }
      },
      { fixtureCells: fixture, firstScreenRange: FIRST_SCREEN_RANGE },
    )

    expect(measurement.commit).toEqual({
      accepted: fixture.length,
      errors: 0,
      formulas: FIXTURE_ROWS * 2,
      rejectedFormulas: 0,
    })
    expect(measurement.counters.beforeFirstScreenRead).toMatchObject({
      formulaCount: FIXTURE_ROWS * 2,
      formulaEvalCountTotal: 0,
    })
    expect(measurement.firstScreen.cellCount).toBe(FIRST_SCREEN_ROWS * 4)
    expect(measurement.counters.afterFirstScreenRead.formulaEvalCountTotal).toBe(
      FIRST_SCREEN_ROWS * 2,
    )
    expect(measurement.firstScreen.sampleDisplays).toEqual(['2', '3', '3', '4'])
    console.info(`AD826_FIRST_SCREEN_OBSERVATION ${JSON.stringify(measurement)}`)
    await expectNoConsoleErrors(page)
  })
})
