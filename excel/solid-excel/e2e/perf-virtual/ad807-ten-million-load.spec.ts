import { existsSync, statSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleErrors, gotoDemo, guardConsoleErrors } from '../helpers'

const INPUT_PATH = process.env.AD807_TEN_MILLION_TSV
const INPUT_ROWS = 10_000
const INPUT_COLUMNS = 1_000
const INPUT_CELLS = INPUT_ROWS * INPUT_COLUMNS
const ATOMIC_SESSION_LIMIT = 200_000

type MemoryObservation = {
  legacyUsedJsHeapSize: number | null
  measureUserAgentSpecificMemory: { bytes: number | null; error: string | null; supported: boolean }
}

type BoundaryObservation = {
  activeSubscriptionCount: number | null
  dom: { cellElements: number; elements: number }
  memory: MemoryObservation
  workerCounters: unknown
}

type ImportTrace = {
  chunksAttempted: number
  chunksSucceeded: number
  lastSuccessfulCumulativeAccepted: number | null
  requestedCellCount: number
}

type DebugWindow = Window & {
  __ad807ImportTrace?: ImportTrace
  __ad807OriginalImportChunk?: (...args: unknown[]) => Promise<unknown>
  __einfachStore?: { activeSubscriptionCount?: () => number }
  __einfachWorkbookDebugClient?: {
    debugCounters?: () => Promise<unknown>
    importChunk?: (...args: unknown[]) => Promise<unknown>
  }
}

function decimalLength(value: number): number {
  return String(value).length
}

function expectedAd806ByteLength(): number {
  let total = 0
  for (let row = 0; row < INPUT_ROWS; row += 1) {
    const cellPrefixLength = 2 + decimalLength(row)
    for (let column = 0; column < INPUT_COLUMNS; column += 1) {
      total += cellPrefixLength + decimalLength(column)
    }
    total += INPUT_COLUMNS
  }
  return total
}

async function observeBoundary(page: Page): Promise<BoundaryObservation> {
  return page.evaluate(async () => {
    const win = window as unknown as DebugWindow
    const memoryApi = performance as Performance & {
      memory?: { usedJSHeapSize?: number }
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
    }
    let measuredBytes: number | null = null
    let measurementError: string | null = null
    if (typeof memoryApi.measureUserAgentSpecificMemory === 'function') {
      try {
        measuredBytes = (await memoryApi.measureUserAgentSpecificMemory()).bytes
      } catch (error) {
        measurementError = error instanceof Error ? error.message : String(error)
      }
    }
    return {
      activeSubscriptionCount: win.__einfachStore?.activeSubscriptionCount?.() ?? null,
      dom: {
        cellElements: document.querySelectorAll('td.cell').length,
        elements: document.querySelectorAll('*').length,
      },
      memory: {
        legacyUsedJsHeapSize: memoryApi.memory?.usedJSHeapSize ?? null,
        measureUserAgentSpecificMemory: {
          bytes: measuredBytes,
          error: measurementError,
          supported: typeof memoryApi.measureUserAgentSpecificMemory === 'function',
        },
      },
      workerCounters: (await win.__einfachWorkbookDebugClient?.debugCounters?.()) ?? null,
    }
  })
}

async function installImportTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as DebugWindow
    const client = win.__einfachWorkbookDebugClient
    if (!client?.importChunk) throw new Error('AD-807 requires the DemoMillion debug import client')
    if (win.__ad807OriginalImportChunk) return
    const original = client.importChunk.bind(client)
    win.__ad807OriginalImportChunk = original
    win.__ad807ImportTrace = {
      chunksAttempted: 0,
      chunksSucceeded: 0,
      lastSuccessfulCumulativeAccepted: null,
      requestedCellCount: 0,
    }
    client.importChunk = async (...args: unknown[]) => {
      const cells = Array.isArray(args[1]) ? args[1] : []
      const trace = win.__ad807ImportTrace
      if (!trace) throw new Error('AD-807 import trace disappeared')
      trace.chunksAttempted += 1
      trace.requestedCellCount += cells.length
      const result = await original(...args)
      trace.chunksSucceeded += 1
      if (typeof result === 'number') trace.lastSuccessfulCumulativeAccepted = result
      return result
    }
  })
}

async function readImportTrace(page: Page): Promise<ImportTrace> {
  return page
    .evaluate(() => (window as unknown as DebugWindow).__ad807ImportTrace ?? null)
    .then((trace) => {
      if (!trace) throw new Error('AD-807 import trace is unavailable')
      return trace
    })
}

async function restoreImportTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as DebugWindow
    if (win.__einfachWorkbookDebugClient && win.__ad807OriginalImportChunk) {
      win.__einfachWorkbookDebugClient.importChunk = win.__ad807OriginalImportChunk
    }
    delete win.__ad807OriginalImportChunk
    delete win.__ad807ImportTrace
  })
}

test.describe('AD-807 ten-million filled-cell load observation', () => {
  test.skip(!INPUT_PATH, 'set AD807_TEN_MILLION_TSV to the AD-806 10000x1000 TSV')

  test('records the live DemoMillion atomic-session boundary without claiming a successful load', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'wasm', 'AD-807 records the DemoMillion WASM worker run')
    test.setTimeout(20 * 60_000)
    if (!INPUT_PATH || !existsSync(INPUT_PATH))
      throw new Error(`missing AD-807 input: ${INPUT_PATH}`)
    expect(statSync(INPUT_PATH).size).toBe(expectedAd806ByteLength())

    guardConsoleErrors(page)
    await gotoDemo(page, '1M Cells', 'debug=1')
    await installImportTrace(page)
    const samples: Array<{ boundary: BoundaryObservation; phase: string; timestamp: string }> = []
    samples.push({
      boundary: await observeBoundary(page),
      phase: 'ready',
      timestamp: new Date().toISOString(),
    })

    try {
      const startedAt = new Date().toISOString()
      const startedMs = Date.now()
      await page.locator('[data-testid="million-import-input"]').setInputFiles(INPUT_PATH)
      samples.push({
        boundary: await observeBoundary(page),
        phase: 'after-input-selected',
        timestamp: new Date().toISOString(),
      })
      const status = page.locator('[data-testid="million-import-status"]')
      await expect
        .poll(async () => (await status.textContent()) ?? '', { timeout: 15 * 60_000 })
        .toMatch(/failed/i)

      const error =
        (await page.locator('[data-testid="million-import-error"]').textContent()) ?? null
      const statsText =
        (await page.locator('[data-testid="million-import-stats"]').textContent()) ?? null
      const trace = await readImportTrace(page)
      samples.push({
        boundary: await observeBoundary(page),
        phase: 'failed',
        timestamp: new Date().toISOString(),
      })
      const observation = {
        atomicSessionLimit: ATOMIC_SESSION_LIMIT,
        elapsedMs: Date.now() - startedMs,
        error,
        fixture: {
          byteLength: statSync(INPUT_PATH).size,
          columns: INPUT_COLUMNS,
          populatedCellCount: INPUT_CELLS,
          rows: INPUT_ROWS,
        },
        project: test.info().project.name,
        samples,
        startedAt,
        statsText,
        trace,
        userAgent: await page.evaluate(() => navigator.userAgent),
        warmupRuns: [],
      }

      expect(error).toContain('import session exceeded normalized cell limit')
      expect(trace.lastSuccessfulCumulativeAccepted).toBe(ATOMIC_SESSION_LIMIT)
      expect(trace.requestedCellCount).toBe(ATOMIC_SESSION_LIMIT + 1_000)
      console.info(`AD807_TEN_MILLION_LOAD_OBSERVATION ${JSON.stringify(observation)}`)
      await expectNoConsoleErrors(page)
    } finally {
      if (!page.isClosed()) await restoreImportTrace(page)
    }
  })
})
