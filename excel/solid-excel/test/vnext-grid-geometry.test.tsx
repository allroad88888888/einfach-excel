/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  DisplayCell,
  SpreadsheetBackend,
  VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import {
  addOutlineGroupAtom,
  setFreezeConfigAtom,
  viewportMetricsAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid } from '../src/grid'
import { SpreadsheetUiProvider } from '../src/provider'

const SHEET_ID = 'sheet-1'

afterEach(cleanup)

function buildCells(
  window: VisibleProjectionRequest['window'],
  merge: { row: number; col: number; rows: number; cols: number },
): DisplayCell[] {
  const cells: DisplayCell[] = []
  for (let row = window.rowStart; row <= window.rowEnd; row += 1) {
    for (let col = window.colStart; col <= window.colEnd; col += 1) {
      const insideMerge =
        row >= merge.row &&
        row < merge.row + merge.rows &&
        col >= merge.col &&
        col < merge.col + merge.cols
      if (row === merge.row && col === merge.col) {
        cells.push({
          row,
          col,
          displayValue: 'Merged',
          mergedSpan: { rows: merge.rows, cols: merge.cols },
        })
      } else if (insideMerge) {
        cells.push({ row, col, displayValue: '', mergeAnchor: { row: merge.row, col: merge.col } })
      } else {
        cells.push({ row, col, displayValue: `${row},${col}` })
      }
    }
  }
  return cells
}

function createBackend(merge: {
  row: number
  col: number
  rows: number
  cols: number
}): SpreadsheetBackend {
  return {
    async readVisibleProjection(request) {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        window: { ...request.window },
        requestId: request.requestId,
        revision: request.revision,
        cells: buildCells(request.window, merge),
      }
    },
    async readRangeProjection(request) {
      return {
        kind: 'range',
        sheetId: request.sheetId,
        range: { ...request.range },
        requestId: request.requestId,
        revision: request.revision,
        cells: [],
      }
    },
    async setCellInput(request) {
      return { sheetId: request.sheetId, requestId: request.requestId, revision: 1 }
    },
  }
}

function renderGrid(
  store: ReturnType<typeof createStore>,
  viewport: Parameters<typeof SpreadsheetGrid>[0]['viewport'],
  merge: { row: number; col: number; rows: number; cols: number },
) {
  return render(() => (
    <SpreadsheetUiProvider backend={createBackend(merge)} store={store}>
      <SpreadsheetGrid sheetId={SHEET_ID} viewport={viewport} data-testid="grid" />
    </SpreadsheetUiProvider>
  ))
}

describe('SpreadsheetGrid geometry', () => {
  it('uses atom geometry for freeze lines when a terminal frozen cell is merged', async () => {
    const store = createStore()
    store.setter(setFreezeConfigAtom, { sheetId: SHEET_ID, rows: 2, cols: 2 })
    store.setter(addOutlineGroupAtom, { sheetId: SHEET_ID, axis: 'row', start: 0, end: 0 })
    store.setter(addOutlineGroupAtom, { sheetId: SHEET_ID, axis: 'column', start: 0, end: 0 })
    const { container } = renderGrid(
      store,
      {
        scrollTop: 0,
        scrollLeft: 0,
        viewportHeight: 30,
        viewportWidth: 60,
        rowHeight: 10,
        colWidth: 20,
        rowCount: 6,
        colCount: 6,
        overscanRows: 0,
        overscanCols: 0,
      },
      { row: 1, col: 1, rows: 2, cols: 2 },
    )

    await waitFor(() => {
      expect(container.querySelector('[data-cell-addr="B2"]')).not.toBeNull()
    })

    const anchor = container.querySelector('[data-cell-addr="B2"]') as HTMLTableCellElement
    expect(anchor.rowSpan).toBe(2)
    expect(anchor.colSpan).toBe(2)
    expect(anchor.style.height).toBe('20px')
    expect(anchor.style.width).toBe('40px')
    expect(
      container.querySelector('[data-testid="freeze-boundary-horizontal"]')?.getAttribute('y1'),
    ).toBe('50')
    expect(
      container.querySelector('[data-testid="freeze-boundary-vertical"]')?.getAttribute('x1'),
    ).toBe('104')
    expect(
      container.querySelector('[data-testid="freeze-boundary-vertical"]')?.getAttribute('x2'),
    ).toBe('104')
  })

  it('keeps the leading logical row anchored as an outline collapses rows above it', async () => {
    const store = createStore()
    const { container } = renderGrid(
      store,
      {
        scrollTop: 0,
        scrollLeft: 0,
        viewportHeight: 3,
        viewportWidth: 3,
        rowHeight: 1,
        colWidth: 1,
        rowCount: 20,
        colCount: 4,
        overscanRows: 0,
        overscanCols: 0,
      },
      { row: 0, col: 0, rows: 4, cols: 1 },
    )

    await waitFor(() => {
      expect(container.querySelector('[data-cell-addr="A1"]')).not.toBeNull()
    })
    store.setter(viewportMetricsAtom, { ...store.getter(viewportMetricsAtom), scrollTop: 4 })
    store.setter(addOutlineGroupAtom, { sheetId: SHEET_ID, axis: 'row', start: 1, end: 2 })
    await waitFor(() => {
      expect(container.querySelector('[data-testid="outline-row-toggle-1-2"]')).not.toBeNull()
    })

    fireEvent.click(container.querySelector('[data-testid="outline-row-toggle-1-2"]')!)

    await waitFor(() => {
      expect(store.getter(viewportMetricsAtom).scrollTop).toBe(2)
      const anchor = container.querySelector('[data-cell-addr="A1"]') as HTMLTableCellElement
      expect(anchor.rowSpan).toBe(2)
      expect(anchor.style.height).toBe('2px')
    })
  })

  it('keeps the leading logical column anchored as an outline collapses columns above it', async () => {
    const store = createStore()
    const { container } = renderGrid(
      store,
      {
        scrollTop: 0,
        scrollLeft: 0,
        viewportHeight: 3,
        viewportWidth: 5,
        rowHeight: 1,
        colWidth: 1,
        rowCount: 4,
        colCount: 20,
        overscanRows: 0,
        overscanCols: 0,
      },
      { row: 0, col: 0, rows: 1, cols: 4 },
    )

    await waitFor(() => {
      expect(container.querySelector('[data-cell-addr="A1"]')).not.toBeNull()
    })
    store.setter(viewportMetricsAtom, { ...store.getter(viewportMetricsAtom), scrollLeft: 4 })
    store.setter(addOutlineGroupAtom, { sheetId: SHEET_ID, axis: 'column', start: 1, end: 2 })
    await waitFor(() => {
      expect(container.querySelector('[data-testid="outline-col-toggle-1-2"]')).not.toBeNull()
    })

    fireEvent.click(container.querySelector('[data-testid="outline-col-toggle-1-2"]')!)

    await waitFor(() => {
      expect(store.getter(viewportMetricsAtom).scrollLeft).toBe(2)
      const anchor = container.querySelector('[data-cell-addr="A1"]') as HTMLTableCellElement
      expect(anchor.colSpan).toBe(2)
      expect(anchor.style.width).toBe('2px')
    })
  })
})
