/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  DisplayCell,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { selectCellAtom, selectionSnapshotAtom } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid } from '../src-vnext/grid'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const VIEWPORT = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 3,
  viewportWidth: 3,
  rowHeight: 1,
  colWidth: 1,
  rowCount: 3,
  colCount: 3,
  overscanRows: 0,
  overscanCols: 0,
}

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
        window: { ...request.window },
        requestId: request.requestId,
        revision: request.revision,
        cells: buildCells(request.window),
      }
      return result
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

async function mountGrid() {
  const store = createStore()
  window.history.replaceState(null, '', '/?svgOverlay=1')
  const result = render(() => (
    <SpreadsheetUiProvider backend={createBackend()} store={store}>
      <SpreadsheetGrid sheetId="sheet-1" viewport={VIEWPORT} data-testid="grid" />
    </SpreadsheetUiProvider>
  ))
  await waitFor(() => {
    expect(result.container.querySelectorAll('td.spreadsheet-grid-cell')).toHaveLength(9)
  })
  const grid = result.container.querySelector<HTMLElement>('[data-testid="grid"]')
  if (!grid) throw new Error('missing grid')
  return { ...result, grid, store }
}

function dispatchKey(element: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  element.dispatchEvent(event)
  return event
}

function selectCell(store: ReturnType<typeof createStore>, row: number, col: number) {
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row, col } })
}

describe('vNext grid focus and keyboard contract', () => {
  it('uses a single tab stop and exposes the selected atom cell as aria-activedescendant', async () => {
    const { container, grid, store } = await mountGrid()
    expect(grid.getAttribute('role')).toBe('grid')
    expect(grid.tabIndex).toBe(0)
    expect(grid.getAttribute('aria-rowcount')).toBe('3')
    expect(grid.getAttribute('aria-colcount')).toBe('3')
    expect(grid.getAttribute('aria-multiselectable')).toBe('true')
    expect(container.querySelector('.spreadsheet-grid-table')?.getAttribute('role')).toBe(
      'presentation',
    )
    expect(container.querySelector('.spreadsheet-grid-table > tbody')?.getAttribute('role')).toBe(
      'rowgroup',
    )
    expect(container.querySelector('.spreadsheet-grid-col-header')?.getAttribute('role')).toBe(
      'columnheader',
    )
    expect(container.querySelector('.spreadsheet-grid-row-header')?.getAttribute('role')).toBe(
      'rowheader',
    )
    expect(container.querySelector('.spreadsheet-grid-row')?.getAttribute('role')).toBe('row')
    expect(container.querySelector('.spreadsheet-grid-cell')?.getAttribute('role')).toBe('gridcell')
    await waitFor(() => {
      expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
        sheetId: 'sheet-1',
        row: 0,
        col: 0,
      })
      expect(grid.getAttribute('aria-activedescendant')).toBe('spreadsheet-grid-cell-sheet-1-0-0')
    })

    selectCell(store, 1, 2)
    const id = 'spreadsheet-grid-cell-sheet-1-1-2'
    await waitFor(() => {
      expect(grid.getAttribute('aria-activedescendant')).toBe(id)
      expect(container.querySelector(`#${id}`)?.getAttribute('data-cell-addr')).toBe('C2')
    })
  })

  it('keeps focus on the grid while arrows move and Shift+arrows extend the atom selection', async () => {
    const { grid, store } = await mountGrid()
    selectCell(store, 0, 0)
    grid.focus()

    const arrowEvent = dispatchKey(grid, { key: 'ArrowRight' })
    expect(arrowEvent.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
        sheetId: 'sheet-1',
        row: 0,
        col: 1,
      })
      expect(grid.getAttribute('aria-activedescendant')).toBe('spreadsheet-grid-cell-sheet-1-0-1')
    })

    const extendEvent = dispatchKey(grid, { key: 'ArrowDown', shiftKey: true })
    expect(extendEvent.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(store.getter(selectionSnapshotAtom).range).toEqual({
        rowStart: 0,
        rowEnd: 1,
        colStart: 1,
        colEnd: 1,
      })
      expect(document.activeElement).toBe(grid)
    })
  })

  it('moves within the grid on Tab but leaves first and last cells for native Tab navigation', async () => {
    const { grid, store } = await mountGrid()
    selectCell(store, 0, 1)

    const innerTab = dispatchKey(grid, { key: 'Tab' })
    expect(innerTab.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
        sheetId: 'sheet-1',
        row: 0,
        col: 2,
      })
    })

    selectCell(store, 2, 2)
    expect(dispatchKey(grid, { key: 'Tab' }).defaultPrevented).toBe(false)
    expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
      sheetId: 'sheet-1',
      row: 2,
      col: 2,
    })

    selectCell(store, 0, 0)
    expect(dispatchKey(grid, { key: 'Tab', shiftKey: true }).defaultPrevented).toBe(false)
    expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
      sheetId: 'sheet-1',
      row: 0,
      col: 0,
    })
  })

  it('keeps rendered nonediting grid affordances out of sequential Tab navigation', async () => {
    const { grid } = await mountGrid()
    const scrollViewport = grid.querySelector<HTMLElement>('.spreadsheet-grid-scroll-viewport')
    const affordances = Array.from(
      grid.querySelectorAll<HTMLButtonElement>(
        '.spreadsheet-grid-col-resize-handle, .spreadsheet-grid-row-resize-handle, .spreadsheet-grid-fill-handle',
      ),
    )

    expect(scrollViewport?.tabIndex).toBe(-1)
    expect(affordances.length).toBeGreaterThan(0)
    for (const affordance of affordances) {
      expect(affordance.tabIndex).toBe(-1)
    }
  })

  it('restores the grid focus surface after a cell click', async () => {
    const { container, grid } = await mountGrid()
    const cell = container.querySelector<HTMLElement>('[data-cell-addr="B2"]')
    if (!cell) throw new Error('missing cell B2')

    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    fireEvent.click(cell)

    await waitFor(() => expect(document.activeElement).toBe(grid))
    outside.remove()
  })
})
