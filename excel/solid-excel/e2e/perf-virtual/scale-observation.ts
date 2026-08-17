import type { Page } from '@playwright/test'

/**
 * Shared probes for the AD-808 / AD-809 / AD-812 scale specs.
 *
 * Everything here reads existing `?debug=1` surfaces (CASES.md header:
 * perf-virtual is the only folder allowed to assert on them) — nothing
 * mutates worker guards, import limits, or runtime configuration.
 */

export type MemorySample = {
  legacyUsedJsHeapSize: number | null
  measureUserAgentSpecificMemory: { bytes: number | null; error: string | null; supported: boolean }
}

export type PageScaleSample = {
  activeSubscriptionCount: number | null
  dom: { cellElements: number; elements: number }
  memory: MemorySample
  workerCounters: unknown
}

type DebugWindow = Window & {
  __einfachStore?: {
    activeSubscriptionCount?: () => number
    setSelectionAnchor?: (coord: { row: number; col: number }) => void
    extendSelection?: (coord: { row: number; col: number }) => void
    selectionAddrs?: (limit?: number) => string[][] | null
  }
  __einfachWorkbookStore?: { refreshVisible?: (sheetIdx?: number) => void }
  __einfachWorkbookDebugClient?: {
    beginImport?: (options?: { mode?: 'atomic' | 'direct' }) => Promise<number>
    importChunk?: (sessionId: number, cells: unknown[]) => Promise<number>
    commitImport?: (sessionId: number) => Promise<unknown>
    cancelImport?: (sessionId: number) => Promise<boolean>
    debugCounters?: () => Promise<unknown>
  }
}

/** DOM / subscription / worker-counter / memory snapshot of a live demo page. */
export async function samplePage(page: Page): Promise<PageScaleSample> {
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

/**
 * Sanctioned deep-viewport travel: move the selection anchor and let the
 * viewport follow (raw wrapper scrolls that leave the selection behind
 * are reverted by keep-selection-in-view — see CASES.md PV-30).
 */
export async function anchorTo(page: Page, row: number, col: number): Promise<void> {
  await page.evaluate(
    (coord) => {
      const win = window as unknown as DebugWindow
      win.__einfachStore?.setSelectionAnchor?.(coord)
    },
    { row, col },
  )
}

/**
 * Seed the live DemoMillion workbook with the AD-806 deterministic fill
 * (`r{row}c{col}` text at every zero-based coordinate) through the wire
 * protocol's non-atomic `direct` import mode. The atomic 200,000-cell
 * session guard recorded by AD-807/AD-810 applies to atomic sessions
 * only; `direct` chunks write additively into the live workbook. Chunks
 * stay at the wire maximum of 10,000 cells.
 */
export async function seedAd806DirectImport(
  page: Page,
  rows: number,
  cols: number,
): Promise<{ accepted: number; elapsedMs: number; stats: unknown }> {
  return page.evaluate(
    async ({ rows: totalRows, cols: totalCols }) => {
      const win = window as unknown as DebugWindow
      const client = win.__einfachWorkbookDebugClient
      if (!client?.beginImport || !client.importChunk || !client.commitImport) {
        throw new Error('AD-806 seeding requires the DemoMillion debug import client')
      }
      const chunkRows = Math.max(1, Math.floor(10_000 / totalCols))
      const startedMs = performance.now()
      const session = await client.beginImport({ mode: 'direct' })
      let accepted = 0
      try {
        for (let rowStart = 0; rowStart < totalRows; rowStart += chunkRows) {
          const rowEnd = Math.min(totalRows, rowStart + chunkRows)
          const chunk: unknown[] = []
          for (let row = rowStart; row < rowEnd; row += 1) {
            for (let col = 0; col < totalCols; col += 1) {
              chunk.push({ sheet: 0, row, col, kind: 'text', value: `r${row}c${col}` })
            }
          }
          accepted = await client.importChunk(session, chunk)
        }
        const stats = await client.commitImport(session)
        win.__einfachWorkbookStore?.refreshVisible?.()
        return { accepted, elapsedMs: performance.now() - startedMs, stats }
      } catch (error) {
        await client.cancelImport?.(session).catch(() => false)
        throw error
      }
    },
    { rows, cols },
  )
}

/** Spreadsheet column label for a zero-based column index (0 → "A"). */
export function columnLabel(col: number): string {
  let label = ''
  let rest = col
  while (rest >= 0) {
    label = String.fromCharCode(65 + (rest % 26)) + label
    rest = Math.floor(rest / 26) - 1
  }
  return label
}

/** A1-style address for zero-based coordinates. */
export function cellAddr(row: number, col: number): string {
  return `${columnLabel(col)}${row + 1}`
}
