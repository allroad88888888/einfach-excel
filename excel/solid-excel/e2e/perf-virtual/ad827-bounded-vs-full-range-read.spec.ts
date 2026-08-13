import { expect, test } from '@playwright/test'
import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

type DebugCounters = {
  formulaCount: number
  formulaEvalCountTotal: number
}

type TelemetryBucket = {
  messageCount: number
  normalizedPayloadBytes: number
  unmeasurableMessageCount: number
}

type TelemetrySnapshot = {
  method: 'canonical-json-utf8-v1'
  total: TelemetryBucket
  byDirection: {
    'host-to-worker': Record<string, TelemetryBucket>
    'worker-to-host': Record<string, TelemetryBucket>
  }
}

type Range = {
  endCol: number
  endRow: number
  sheet: number
  startCol: number
  startRow: number
}

type RangeReadMeasurement = {
  commit: { accepted: number; errors: number; formulas: number; rejectedFormulas: number }
  counters: { afterRead: DebugCounters; beforeRead: DebugCounters }
  range: Range
  resultCount: number
  telemetry: TelemetrySnapshot
}

type ObservationMeasurement = {
  backend: {
    factory: 'defaultExcelCoreTsWorkerFactory' | 'defaultVNextWorkbookWorkerFactory'
    requested: 'ts' | 'wasm'
    runtimeCapabilities: unknown
  }
  bounded: RangeReadMeasurement
  explicitFullFixture: RangeReadMeasurement
  fixture: { populatedCellCount: number; rows: number; shallowFormulaCount: number }
  userAgent: string
}

const FIXTURE_ROWS = 24
const FIXTURE_COLUMNS = 4
const BOUNDED_RANGE: Range = {
  sheet: 0,
  startRow: 0,
  startCol: 0,
  endRow: 11,
  endCol: FIXTURE_COLUMNS - 1,
}
const EXPLICIT_FULL_FIXTURE_RANGE: Range = {
  sheet: 0,
  startRow: 0,
  startCol: 0,
  endRow: FIXTURE_ROWS - 1,
  endCol: FIXTURE_COLUMNS - 1,
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

function expectRangeRead(
  measurement: RangeReadMeasurement,
  range: Range,
  expectedFormulaEvaluations: number,
): void {
  expect(measurement.commit).toEqual({
    accepted: FIXTURE_ROWS * FIXTURE_COLUMNS,
    errors: 0,
    formulas: FIXTURE_ROWS * 2,
    rejectedFormulas: 0,
  })
  expect(measurement.range).toEqual(range)
  expect(measurement.resultCount).toBe((range.endRow - range.startRow + 1) * FIXTURE_COLUMNS)
  expect(measurement.counters.beforeRead).toEqual({
    formulaCount: FIXTURE_ROWS * 2,
    formulaEvalCountTotal: 0,
  })
  expect(measurement.counters.afterRead.formulaEvalCountTotal).toBe(expectedFormulaEvaluations)
  expect(measurement.telemetry.method).toBe('canonical-json-utf8-v1')
  expect(measurement.telemetry.total.unmeasurableMessageCount).toBe(0)
  expect(measurement.telemetry.byDirection['host-to-worker'].request.messageCount).toBe(1)
  expect(measurement.telemetry.byDirection['worker-to-host'].response.messageCount).toBe(1)
  expect(measurement.telemetry.byDirection['worker-to-host'].error.messageCount).toBe(0)
}

test.describe('AD-827 bounded versus explicit full-fixture range-read observation', () => {
  test('records normalized worker payloads for fresh bounded and full-range reads', async ({
    page,
  }) => {
    guardConsoleErrors(page)
    await gotoRoot(page)

    const fixture = shallowFormulaFixture()
    const measurement = await page.evaluate(
      async ({ boundedRange, fixtureCells, fullRange }): Promise<ObservationMeasurement> => {
        type WorkerLike = {
          addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
          postMessage(message: unknown): void
          removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
          terminate(): void
        }

        const requested = new URLSearchParams(window.location.search).get('backend')
        if (requested !== 'ts' && requested !== 'wasm') {
          throw new Error(`AD-827 requires a ts or wasm backend, received ${requested}`)
        }

        const { createWorkerWorkbook } = await import('/src-vnext/adapter/worker-protocol.ts')
        const { createWorkerWireTelemetry } = await import(
          '/src-vnext/adapter/worker-wire-telemetry.ts'
        )
        const { defaultExcelCoreTsWorkerFactory, defaultVNextWorkbookWorkerFactory } = await import(
          '/src-vnext/adapter/worker-factory.ts'
        )
        const workerFactory =
          requested === 'ts' ? defaultExcelCoreTsWorkerFactory : defaultVNextWorkbookWorkerFactory
        const factory =
          requested === 'ts'
            ? 'defaultExcelCoreTsWorkerFactory'
            : 'defaultVNextWorkbookWorkerFactory'

        function createObservedWorkerFactory() {
          const telemetry = createWorkerWireTelemetry()
          return {
            telemetry,
            workerFactory: (): WorkerLike => {
              const worker = workerFactory() as WorkerLike
              const listenerProxies = new Map<
                (event: MessageEvent) => void,
                (event: MessageEvent) => void
              >()
              return {
                postMessage(message) {
                  telemetry.record('host-to-worker', message)
                  worker.postMessage(message)
                },
                addEventListener(type, listener) {
                  const proxy = (event: MessageEvent) => {
                    telemetry.record('worker-to-host', event.data)
                    listener(event)
                  }
                  listenerProxies.set(listener, proxy)
                  worker.addEventListener(type, proxy)
                },
                removeEventListener(type, listener) {
                  const proxy = listenerProxies.get(listener)
                  if (proxy) {
                    worker.removeEventListener(type, proxy)
                    listenerProxies.delete(listener)
                  }
                },
                terminate() {
                  worker.terminate()
                },
              }
            },
          }
        }

        async function readRange(range: Range): Promise<RangeReadMeasurement> {
          const observed = createObservedWorkerFactory()
          const workbook = createWorkerWorkbook({ workerFactory: observed.workerFactory })
          try {
            await workbook.initWorkbook(['AD827'])
            const session = await workbook.beginImport()
            await workbook.importChunk(session, fixtureCells)
            const commit = await workbook.commitImport(session)
            const beforeRead = await workbook.debugCounters()
            observed.telemetry.reset()
            const projection = await workbook.readSparseRange(range)
            const telemetry = observed.telemetry.snapshot()
            const afterRead = await workbook.debugCounters()
            return {
              commit: {
                accepted: commit.accepted,
                errors: commit.errors,
                formulas: commit.formulas,
                rejectedFormulas: commit.rejectedFormulas,
              },
              counters: {
                beforeRead: {
                  formulaCount: beforeRead.formulaCount,
                  formulaEvalCountTotal: beforeRead.formulaEvalCountTotal,
                },
                afterRead: {
                  formulaCount: afterRead.formulaCount,
                  formulaEvalCountTotal: afterRead.formulaEvalCountTotal,
                },
              },
              range,
              resultCount: projection.length,
              telemetry,
            }
          } finally {
            workbook.dispose()
          }
        }

        const observedCapabilities = createObservedWorkerFactory()
        const capabilityWorkbook = createWorkerWorkbook({
          workerFactory: observedCapabilities.workerFactory,
        })
        let runtimeCapabilities: unknown
        try {
          await capabilityWorkbook.initWorkbook(['AD827-capabilities'])
          runtimeCapabilities = await capabilityWorkbook.describeCapabilities()
        } finally {
          capabilityWorkbook.dispose()
        }

        return {
          backend: { factory, requested, runtimeCapabilities },
          bounded: await readRange(boundedRange),
          explicitFullFixture: await readRange(fullRange),
          fixture: {
            populatedCellCount: fixtureCells.length,
            rows: fullRange.endRow - fullRange.startRow + 1,
            shallowFormulaCount: fixtureCells.filter((cell) => cell.kind === 'formula').length,
          },
          userAgent: navigator.userAgent,
        }
      },
      {
        boundedRange: BOUNDED_RANGE,
        fixtureCells: fixture,
        fullRange: EXPLICIT_FULL_FIXTURE_RANGE,
      },
    )

    expect(measurement.fixture).toEqual({
      populatedCellCount: FIXTURE_ROWS * FIXTURE_COLUMNS,
      rows: FIXTURE_ROWS,
      shallowFormulaCount: FIXTURE_ROWS * 2,
    })
    expectRangeRead(measurement.bounded, BOUNDED_RANGE, 24)
    expectRangeRead(measurement.explicitFullFixture, EXPLICIT_FULL_FIXTURE_RANGE, 48)
    expect(measurement.explicitFullFixture.telemetry.total.normalizedPayloadBytes).toBeGreaterThan(
      measurement.bounded.telemetry.total.normalizedPayloadBytes,
    )
    expect(test.info().project.name).toBe(measurement.backend.requested)
    if (measurement.backend.requested === 'ts') {
      expect(measurement.backend.factory).toBe('defaultExcelCoreTsWorkerFactory')
      expect(measurement.backend.runtimeCapabilities).toMatchObject({
        autoFill: false,
        engineHiddenState: false,
      })
    } else {
      expect(measurement.backend.factory).toBe('defaultVNextWorkbookWorkerFactory')
      expect(measurement.backend.runtimeCapabilities).toMatchObject({
        autoFill: true,
        scope: 'auto-fill',
      })
    }

    await test.info().attach('ad827-range-read-observation.json', {
      body: JSON.stringify(measurement),
      contentType: 'application/json',
    })
    await expectNoConsoleErrors(page)
  })
})
