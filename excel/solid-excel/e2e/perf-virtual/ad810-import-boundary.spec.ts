import { createHash } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleErrors, gotoDemo, guardConsoleErrors } from '../helpers'

const ATOMIC_SESSION_LIMIT = 200_000
const COLUMNS = 1_000

type Fixture = {
  bytes: Buffer
  columns: number
  name: string
  populatedCellCount: number
  rows: number
  sha256: string
}

type BoundarySample = {
  activeSubscriptionCount: number | null
  dom: { cellElements: number; elements: number }
  memory: {
    legacyUsedJsHeapSize: number | null
    measureUserAgentSpecificMemory: {
      bytes: number | null
      error: string | null
      supported: boolean
    }
  }
  workerCounters: unknown
  workerImportSessionCount: number | null
}

type ImportTrace = {
  chunksAttempted: number
  chunksSucceeded: number
  lastSuccessfulCumulativeAccepted: number | null
  requestedCellCount: number
}

type DebugWindow = Window & {
  __ad810ImportTrace?: ImportTrace
  __ad810OriginalImportChunk?: (...args: unknown[]) => Promise<unknown>
  __einfachStore?: { activeSubscriptionCount?: () => number }
  __einfachWorkbookDebugClient?: {
    debugCounters?: () => Promise<unknown>
    importChunk?: (...args: unknown[]) => Promise<unknown>
  }
}

function makeFixture(populatedCellCount: number): Fixture {
  const rows: string[] = []
  for (let row = 0; row < Math.ceil(populatedCellCount / COLUMNS); row += 1) {
    const columns = Math.min(COLUMNS, populatedCellCount - row * COLUMNS)
    rows.push(Array.from({ length: columns }, (_, column) => `r${row}c${column}`).join('\t'))
  }
  const bytes = Buffer.from(rows.join('\n'))
  return {
    bytes,
    columns: COLUMNS,
    name: `ad810-${populatedCellCount}-distinct-cells.tsv`,
    populatedCellCount,
    rows: rows.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function observeBoundary(page: Page): Promise<BoundarySample> {
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
    const workerCounters = (await win.__einfachWorkbookDebugClient?.debugCounters?.()) ?? null
    const workerImportSessionCount =
      typeof workerCounters === 'object' &&
      workerCounters !== null &&
      typeof (workerCounters as { importSessionCount?: unknown }).importSessionCount === 'number'
        ? (workerCounters as { importSessionCount: number }).importSessionCount
        : null
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
      workerCounters,
      workerImportSessionCount,
    }
  })
}

async function installImportTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as DebugWindow
    const client = win.__einfachWorkbookDebugClient
    if (!client?.importChunk) throw new Error('AD-810 requires the DemoMillion debug import client')
    if (win.__ad810OriginalImportChunk) return
    const original = client.importChunk.bind(client)
    win.__ad810OriginalImportChunk = original
    win.__ad810ImportTrace = {
      chunksAttempted: 0,
      chunksSucceeded: 0,
      lastSuccessfulCumulativeAccepted: null,
      requestedCellCount: 0,
    }
    client.importChunk = async (...args: unknown[]) => {
      const cells = Array.isArray(args[1]) ? args[1] : []
      const trace = win.__ad810ImportTrace
      if (!trace) throw new Error('AD-810 import trace disappeared')
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
  const trace = await page.evaluate(
    () => (window as unknown as DebugWindow).__ad810ImportTrace ?? null,
  )
  if (!trace) throw new Error('AD-810 import trace is unavailable')
  return trace
}

async function restoreImportTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as DebugWindow
    if (win.__einfachWorkbookDebugClient && win.__ad810OriginalImportChunk) {
      win.__einfachWorkbookDebugClient.importChunk = win.__ad810OriginalImportChunk
    }
    delete win.__ad810OriginalImportChunk
    delete win.__ad810ImportTrace
  })
}

async function runBoundaryImport(page: Page, fixture: Fixture, expectedStatus: RegExp) {
  guardConsoleErrors(page)
  await gotoDemo(page, '1M Cells', 'debug=1')
  await installImportTrace(page)
  const samples: Array<{ boundary: BoundarySample; phase: string; timestamp: string }> = []
  samples.push({
    boundary: await observeBoundary(page),
    phase: 'ready',
    timestamp: new Date().toISOString(),
  })
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  try {
    await page.locator('[data-testid="million-import-input"]').setInputFiles({
      name: fixture.name,
      mimeType: 'text/tab-separated-values',
      buffer: fixture.bytes,
    })
    samples.push({
      boundary: await observeBoundary(page),
      phase: 'after-input-selected',
      timestamp: new Date().toISOString(),
    })
    const status = page.locator('[data-testid="million-import-status"]')
    await expect
      .poll(async () => (await status.textContent()) ?? '', { timeout: 10 * 60_000 })
      .toMatch(expectedStatus)
    const errorLocator = page.locator('[data-testid="million-import-error"]')
    const result = {
      atomicSessionLimit: ATOMIC_SESSION_LIMIT,
      elapsedMs: Date.now() - startedMs,
      error: (await errorLocator.count()) > 0 ? await errorLocator.textContent() : null,
      fixture: {
        byteLength: fixture.bytes.length,
        columns: fixture.columns,
        populatedCellCount: fixture.populatedCellCount,
        rows: fixture.rows,
        sha256: fixture.sha256,
      },
      project: test.info().project.name,
      samples,
      startedAt,
      statsText: (await page.locator('[data-testid="million-import-stats"]').textContent()) ?? null,
      statusText: (await status.textContent()) ?? null,
      trace: await readImportTrace(page),
      userAgent: await page.evaluate(() => navigator.userAgent),
    }
    samples.push({
      boundary: await observeBoundary(page),
      phase: 'settled',
      timestamp: new Date().toISOString(),
    })
    await expectNoConsoleErrors(page)
    return result
  } finally {
    if (!page.isClosed()) await restoreImportTrace(page)
  }
}

test.describe('AD-810 real atomic import-session boundary observation', () => {
  test('commits exactly 200,000 distinct cells through the DemoMillion WASM file input', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'wasm', 'AD-810 records the DemoMillion WASM worker run')
    test.setTimeout(12 * 60_000)
    const observation = await runBoundaryImport(
      page,
      makeFixture(ATOMIC_SESSION_LIMIT),
      /complete/i,
    )

    expect(observation.error).toBeNull()
    expect(observation.statsText).toBe('200 rows, 200000 cells, 200 chunks, 0 errors')
    expect(observation.trace).toEqual({
      chunksAttempted: 200,
      chunksSucceeded: 200,
      lastSuccessfulCumulativeAccepted: ATOMIC_SESSION_LIMIT,
      requestedCellCount: ATOMIC_SESSION_LIMIT,
    })
    expect(observation.samples.at(-1)?.boundary.workerImportSessionCount).toBe(0)
    console.info(`AD810_IMPORT_SESSION_BOUNDARY_OBSERVATION ${JSON.stringify(observation)}`)
  })

  test('rejects the 200,001st distinct cell through the same DemoMillion WASM file input', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'wasm', 'AD-810 records the DemoMillion WASM worker run')
    test.setTimeout(12 * 60_000)
    const observation = await runBoundaryImport(
      page,
      makeFixture(ATOMIC_SESSION_LIMIT + 1),
      /failed/i,
    )

    expect(observation.error).toContain('import session exceeded normalized cell limit')
    expect(observation.trace).toEqual({
      chunksAttempted: 201,
      chunksSucceeded: 200,
      lastSuccessfulCumulativeAccepted: ATOMIC_SESSION_LIMIT,
      requestedCellCount: ATOMIC_SESSION_LIMIT + 1,
    })
    expect(observation.samples.at(-1)?.boundary.workerImportSessionCount).toBe(0)
    console.info(`AD810_IMPORT_SESSION_BOUNDARY_OBSERVATION ${JSON.stringify(observation)}`)
  })
})
