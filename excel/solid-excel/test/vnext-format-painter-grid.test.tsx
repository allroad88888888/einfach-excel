/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import type {
  CapturedFormat,
  SetFormatRangeRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import {
  armFormatPainterAtom,
  exitFormatPainterAtom,
  selectCellAtom,
  setWorkspaceActiveSheetAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid } from '../src-vnext/grid'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

const SHEET_ID = 'sheet-1'
const VIEWPORT = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 30,
  viewportWidth: 60,
  rowHeight: 10,
  colWidth: 20,
  rowCount: 3,
  colCount: 3,
  overscanRows: 0,
  overscanCols: 0,
}
const FORMAT: CapturedFormat['format'] = { bold: true, bgColor: '#ffeecc' }

afterEach(cleanup)

function createBackend() {
  const setFormatRangeCalls: SetFormatRangeRequest[] = []
  const backend: SpreadsheetBackend = {
    async readVisibleProjection(request) {
      return visibleProjection(request)
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
    async setFormatRange(request) {
      setFormatRangeCalls.push(request)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 1,
        affectedRange: { ...request.range },
      }
    },
  }
  return { backend, setFormatRangeCalls }
}

function visibleProjection(request: VisibleProjectionRequest): VisibleProjectionResult {
  const cells = []
  for (let row = request.window.rowStart; row <= request.window.rowEnd; row += 1) {
    for (let col = request.window.colStart; col <= request.window.colEnd; col += 1) {
      cells.push({ row, col, displayValue: `${row},${col}` })
    }
  }
  return {
    kind: 'visible-window',
    sheetId: request.sheetId,
    window: { ...request.window },
    requestId: request.requestId,
    revision: request.revision,
    cells,
  }
}

function primeSelection(store: ReturnType<typeof createStore>): void {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: SHEET_ID })
  store.setter(selectCellAtom, { sheetId: SHEET_ID, coord: { row: 0, col: 0 } })
}

describe('SpreadsheetGrid format painter integration', () => {
  it('mounts the format painter host through the public Grid path', async () => {
    const store = createStore()
    const { backend, setFormatRangeCalls } = createBackend()
    primeSelection(store)
    const { container } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetGrid sheetId={SHEET_ID} viewport={VIEWPORT} data-testid="grid" />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => {
      expect(container.querySelector('[data-cell-addr="A1"]')).not.toBeNull()
    })

    store.setter(armFormatPainterAtom, { format: FORMAT })
    store.setter(selectCellAtom, { sheetId: SHEET_ID, coord: { row: 1, col: 1 } })

    await waitFor(() => {
      expect(setFormatRangeCalls).toHaveLength(1)
    })
    expect(setFormatRangeCalls[0]).toMatchObject({
      sheetId: SHEET_ID,
      range: { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 },
      format: FORMAT,
    })
  })

  it('mirrors the painter cursor only onto the Grid owned by the provider', async () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const first = createBackend()
    const second = createBackend()
    primeSelection(firstStore)
    primeSelection(secondStore)
    const { getByTestId } = render(() => (
      <>
        <SpreadsheetUiProvider backend={first.backend} store={firstStore}>
          <SpreadsheetGrid sheetId={SHEET_ID} viewport={VIEWPORT} data-testid="first-grid" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={second.backend} store={secondStore}>
          <SpreadsheetGrid sheetId={SHEET_ID} viewport={VIEWPORT} data-testid="second-grid" />
        </SpreadsheetUiProvider>
      </>
    ))

    const firstGrid = getByTestId('first-grid')
    const secondGrid = getByTestId('second-grid')
    await waitFor(() => {
      expect(firstGrid.querySelector('[data-cell-addr="A1"]')).not.toBeNull()
      expect(secondGrid.querySelector('[data-cell-addr="A1"]')).not.toBeNull()
    })

    firstStore.setter(armFormatPainterAtom, { format: FORMAT })

    await waitFor(() => {
      expect(firstGrid.getAttribute('data-format-painter-active')).toBe('armed')
    })
    expect(secondGrid.hasAttribute('data-format-painter-active')).toBe(false)

    firstStore.setter(exitFormatPainterAtom)
    await waitFor(() => {
      expect(firstGrid.hasAttribute('data-format-painter-active')).toBe(false)
    })
  })
})
