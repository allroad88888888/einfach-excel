/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import type {
  DisplayCell,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { applyPresenceUpdateAtom, setWorkspaceActiveSheetAtom } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid } from '../src/grid'
import { SpreadsheetUiProvider } from '../src/provider'

afterEach(cleanup)

function buildCells(window: VisibleProjectionRequest['window']): DisplayCell[] {
  const cells: DisplayCell[] = []
  for (let row = window.rowStart; row <= window.rowEnd; row += 1) {
    for (let col = window.colStart; col <= window.colEnd; col += 1) {
      cells.push({ row, col, displayValue: `${row},${col}` })
    }
  }
  return cells
}

function createBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection(request) {
      const result: VisibleProjectionResult = {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision,
        window: { ...request.window },
        cells: buildCells(request.window),
      }
      return result
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async readViewportSizeProjection(request) {
      return {
        kind: 'viewport-size',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? 1,
        window: { ...request.window },
        rowHeights: [],
        colWidths: [],
      }
    },
    async readFreezeConfig(request) {
      return {
        kind: 'freeze-config',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 1,
        freeze: { rows: 0, cols: 0 },
      }
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect
}

function installScrolledCellRects(container: HTMLElement) {
  const scrollRoot = container.querySelector<HTMLElement>('.spreadsheet-grid-scroll-viewport')!
  scrollRoot.getBoundingClientRect = () => rect(500, 200, 240, 120)
  Object.defineProperty(scrollRoot, 'scrollLeft', { configurable: true, value: 120 })
  Object.defineProperty(scrollRoot, 'scrollTop', { configurable: true, value: 48 })
  const cells = [
    ...container.querySelectorAll<HTMLElement>('td.spreadsheet-grid-cell[data-row][data-col]'),
  ]
  const indices = cells.map((cell) => ({
    row: Number(cell.dataset.row),
    col: Number(cell.dataset.col),
  }))
  const rowStart = Math.min(...indices.map((index) => index.row))
  const rowEnd = Math.max(...indices.map((index) => index.row))
  const colStart = Math.min(...indices.map((index) => index.col))
  const colEnd = Math.max(...indices.map((index) => index.col))
  for (const cell of cells) {
    const row = Number(cell.dataset.row)
    const col = Number(cell.dataset.col)
    cell.getBoundingClientRect = () => rect(500 + col * 32 - 120, 200 + row * 24 - 48, 32, 24)
  }
  return { colEnd, colStart, rowEnd, rowStart }
}

describe('SpreadsheetGrid remote presence', () => {
  it('clips a range to projected cells using scrolled DOM coordinates', async () => {
    const store = createStore()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    const { container, getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={createBackend()} store={store}>
        <SpreadsheetGrid
          sheetId="sheet-1"
          viewport={{
            rowCount: 20,
            colCount: 20,
            rowHeight: 24,
            colWidth: 32,
            viewportHeight: 120,
            viewportWidth: 240,
            scrollTop: 0,
            scrollLeft: 0,
            overscanRows: 0,
            overscanCols: 0,
          }}
        />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => {
      expect(
        container.querySelectorAll('td.spreadsheet-grid-cell[data-row][data-col]').length,
      ).toBeGreaterThan(0)
    })
    const projected = installScrolledCellRects(container)
    store.setter(applyPresenceUpdateAtom, {
      kind: 'join',
      participant: { id: 'alice', displayName: 'Alice', colorHint: '#f97316', lastSeenAt: 1 },
    })
    store.setter(applyPresenceUpdateAtom, {
      kind: 'cursor',
      participantId: 'alice',
      sheetId: 'sheet-1',
      selection: {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 0, col: 0 },
        focus: { row: 19, col: 19 },
      },
    })

    await waitFor(() => {
      const marker = getByTestId('remote-cursor-alice') as HTMLElement
      expect(marker.getAttribute('data-selection-kind')).toBe('range')
      expect(marker.style.left).toBe(`${projected.colStart * 32 - 120}px`)
      expect(marker.style.top).toBe(`${projected.rowStart * 24 - 48}px`)
      expect(marker.style.width).toBe(`${(projected.colEnd - projected.colStart + 1) * 32}px`)
      expect(marker.style.height).toBe(`${(projected.rowEnd - projected.rowStart + 1) * 24}px`)
    })
  })
})
