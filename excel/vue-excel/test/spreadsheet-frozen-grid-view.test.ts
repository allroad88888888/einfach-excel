import type { DisplayCell, ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { createApp, h } from 'vue'
import {
  SpreadsheetFrozenGridView,
  type SpreadsheetFrozenGridViewProps,
} from '../src/SpreadsheetFrozenGridView'

const METRICS: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 40,
  viewportWidth: 60,
  rowHeight: 20,
  colWidth: 30,
  rowCount: 4,
  colCount: 4,
  overscanRows: 0,
  overscanCols: 0,
}

function mountFrozenGrid(props: SpreadsheetFrozenGridViewProps) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(SpreadsheetFrozenGridView, props) })
  app.mount(host)
  return { app, host }
}

function quadrants(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('[data-frozen-quadrant]')).map(
    (element) => element.getAttribute('data-frozen-quadrant') ?? '',
  )
}

function cell(
  host: HTMLElement,
  pane: string,
  row: number,
  col: number,
): HTMLTableCellElement | null {
  return host.querySelector<HTMLTableCellElement>(
    `[data-frozen-quadrant="${pane}"] [data-row="${row}"][data-col="${col}"]`,
  )
}

function displayCell(row: number, col: number, displayValue: string): DisplayCell {
  return { row, col, displayValue }
}

describe('SpreadsheetFrozenGridView', () => {
  it('uses one scrolling pane when no rows or columns are frozen', () => {
    const { app, host } = mountFrozenGrid({
      cells: [displayCell(0, 0, 'A1')],
      metrics: METRICS,
    })

    expect(quadrants(host)).toEqual(['bottom-right'])
    expect(cell(host, 'bottom-right', 0, 0)).toHaveTextContent('A1')

    app.unmount()
  })

  it('projects frozen rows into the top-right pane', () => {
    const { app, host } = mountFrozenGrid({
      cells: [],
      freeze: { rows: 1, cols: 0 },
      metrics: METRICS,
    })

    expect(quadrants(host)).toEqual(['top-right', 'bottom-right'])
    expect(cell(host, 'top-right', 0, 0)).toBeTruthy()
    expect(cell(host, 'bottom-right', 1, 0)).toBeTruthy()

    app.unmount()
  })

  it('projects frozen columns into the bottom-left pane', () => {
    const { app, host } = mountFrozenGrid({
      cells: [],
      freeze: { rows: 0, cols: 1 },
      metrics: METRICS,
    })

    expect(quadrants(host)).toEqual(['bottom-left', 'bottom-right'])
    expect(cell(host, 'bottom-left', 0, 0)).toBeTruthy()
    expect(cell(host, 'bottom-right', 0, 1)).toBeTruthy()

    app.unmount()
  })

  it('renders all four quadrants while preserving formatted selected cells', () => {
    const { app, host } = mountFrozenGrid({
      cells: [{ ...displayCell(0, 0, 'frozen'), format: { bold: true } }],
      freeze: { rows: 1, cols: 1 },
      metrics: METRICS,
      selected: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    })

    expect(quadrants(host)).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    const frozenCell = cell(host, 'top-left', 0, 0)
    expect(frozenCell).toHaveAttribute('data-selected', 'true')
    expect(frozenCell?.style.fontWeight).toBe('bold')

    app.unmount()
  })

  it('clamps freeze counts that exceed the available rows and columns', () => {
    const { app, host } = mountFrozenGrid({
      cells: [],
      freeze: { rows: 99, cols: 99 },
      metrics: METRICS,
    })

    expect(quadrants(host)).toEqual(['top-left'])
    expect(host.querySelectorAll('[data-frozen-quadrant="top-left"] td')).toHaveLength(16)

    app.unmount()
  })
})
