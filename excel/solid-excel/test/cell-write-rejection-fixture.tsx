/** @jsxImportSource solid-js */

/**
 * Harness for the refused-cell-write suites
 * (`vnext-cell-write-rejection.test.tsx`): a backend whose `setCellInput`
 * starts refusing after N accepted writes, the render/interaction helpers
 * for the two hosts that drive it, and an unhandled-rejection watch.
 *
 * Not a `.test.` file, so Jest's default `testMatch` never collects it.
 */

import { expect, jest } from '@jest/globals'
import type { createStore } from '@einfach/core'
import { fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  DisplayCell,
  SetCellInputRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { openMenuAtom } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetContextMenu } from '../src-vnext/context-menu'
import { SpreadsheetGrid } from '../src-vnext/grid'
import { SpreadsheetUiProvider } from '../src-vnext/provider'
import { seedReadyVisibleProjection } from './projection-test-fixture'

type Store = ReturnType<typeof createStore>

/** Stub `navigator.clipboard`; returns the restore callback. */
export function installClipboard(text: string): () => void {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: jest.fn(async () => text),
      writeText: jest.fn(async () => undefined),
    },
  })
  return () => {
    if (previous) Object.defineProperty(navigator, 'clipboard', previous)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
}

/**
 * The exact shape the worker RPC boundary hands the host: a plain Error
 * carrying an own `code` plus the structured `detail` (`worker-protocol.ts`
 * `toError`). `invalid-address` is used because it survived ADR 0006 —
 * the assertions never look at it.
 */
export function cellWriteRejected(addr: string): Error {
  return Object.assign(new Error(`cannot write ${addr}: not a valid cell address`), {
    code: 'CELL_WRITE_REJECTED',
    detail: { code: 'invalid-address' },
  })
}

/**
 * Backend WITHOUT `importCells` / `importCellChunks`, so paste takes the
 * per-cell `setCellInput` fallback. The first `rejectAfter` writes succeed;
 * every later one refuses.
 */
export function createRefusingBackend(rejectAfter: number) {
  const setCellInputRequests: SetCellInputRequest[] = []
  const readVisibleRequests: VisibleProjectionRequest[] = []
  let accepted = 0

  const backend: SpreadsheetBackend = {
    async readVisibleProjection(request) {
      readVisibleRequests.push(request)
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        window: { ...request.window },
        requestId: request.requestId,
        revision: request.revision,
        cells: [] as DisplayCell[],
      }
    },
    async readRangeProjection(request) {
      return {
        kind: 'range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision,
        range: { ...request.range },
        cells: [] as DisplayCell[],
      }
    },
    async setCellInput(request) {
      setCellInputRequests.push(request)
      if (accepted >= rejectAfter) {
        throw cellWriteRejected(`R${request.row + 1}C${request.col + 1}`)
      }
      accepted += 1
      return { sheetId: request.sheetId, requestId: request.requestId, revision: 30 + accepted }
    },
  }

  return { backend, setCellInputRequests, readVisibleRequests }
}

/** Collect unhandled rejections raised while `run` executes. */
export async function withUnhandledRejectionWatch(run: () => Promise<void>): Promise<unknown[]> {
  const seen: unknown[] = []
  const listener = (reason: unknown) => {
    seen.push(reason)
  }
  process.on('unhandledRejection', listener)
  try {
    await run()
    // Node emits `unhandledRejection` at the end of a microtask checkpoint;
    // two macrotask turns are enough for a leaked rejection to show up.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  } finally {
    process.off('unhandledRejection', listener)
  }
  return seen
}

const VIEWPORT = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 4,
  viewportWidth: 4,
  rowHeight: 1,
  colWidth: 1,
  rowCount: 10,
  colCount: 10,
  overscanRows: 0,
  overscanCols: 0,
}

export function renderGrid(
  backend: SpreadsheetBackend,
  store: Store,
): ReturnType<typeof render> {
  return render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetGrid sheetId="sheet-1" viewport={VIEWPORT} data-testid="grid" />
    </SpreadsheetUiProvider>
  ))
}

export async function waitForGrid(container: HTMLElement) {
  await waitFor(() => {
    expect(container.querySelectorAll('td.spreadsheet-grid-cell')).toHaveLength(16)
  })
}

export function clickCell(container: HTMLElement, addr: string) {
  const selector = `[data-cell-addr="${addr}"] .spreadsheet-grid-cell-button`
  fireEvent.click(container.querySelector(selector)!)
}

export function pressGridKey(container: HTMLElement, init: KeyboardEventInit) {
  fireEvent.keyDown(container.querySelector('[data-testid="grid"]')!, init)
}

export function renderContextMenu(
  backend: SpreadsheetBackend,
  store: Store,
): ReturnType<typeof render> {
  return render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetContextMenu />
    </SpreadsheetUiProvider>
  ))
}

/**
 * The context menu renders without a grid, so `refreshVisibleProjection`
 * has no window to re-request until one is seeded.
 */
export function seedVisibleWindow(store: Store) {
  const window = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 }
  seedReadyVisibleProjection(store, {
    status: 'ready',
    request: { kind: 'visible-window', sheetId: 'sheet-1', window, requestId: 1 },
    result: { kind: 'visible-window', sheetId: 'sheet-1', window, requestId: 1, cells: [] },
  })
}

export function openCellMenu(store: Store) {
  store.setter(openMenuAtom, {
    surface: 'cell',
    target: { kind: 'cell', sheetId: 'sheet-1', cell: { row: 0, col: 0 } },
    position: { x: 0, y: 0 },
    source: 'pointer',
  })
}
