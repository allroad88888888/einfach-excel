import type { DisplayCell, ViewportMetrics } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react'
import { SpreadsheetFrozenGridView } from '../src/SpreadsheetFrozenGridView'

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

function quadrants(): string[] {
  return Array.from(document.querySelectorAll('[data-frozen-quadrant]')).map(
    (element) => element.getAttribute('data-frozen-quadrant') ?? '',
  )
}

function cell(row: number, col: number, displayValue: string): DisplayCell {
  return { row, col, displayValue }
}

describe('SpreadsheetFrozenGridView', () => {
  it('uses one scrolling pane when no rows or columns are frozen', () => {
    render(<SpreadsheetFrozenGridView cells={[cell(0, 0, 'A1')]} metrics={METRICS} />)

    expect(quadrants()).toEqual(['bottom-right'])
    expect(document.querySelector('[data-cell="0:0"]')?.textContent).toBe('A1')
  })

  it('projects frozen rows into the top-right pane', () => {
    render(<SpreadsheetFrozenGridView cells={[]} freeze={{ rows: 1, cols: 0 }} metrics={METRICS} />)

    expect(quadrants()).toEqual(['top-right', 'bottom-right'])
    expect(
      document.querySelector('[data-frozen-quadrant="top-right"] [data-cell="0:0"]'),
    ).toBeTruthy()
    expect(
      document.querySelector('[data-frozen-quadrant="bottom-right"] [data-cell="1:0"]'),
    ).toBeTruthy()
  })

  it('projects frozen columns into the bottom-left pane', () => {
    render(<SpreadsheetFrozenGridView cells={[]} freeze={{ rows: 0, cols: 1 }} metrics={METRICS} />)

    expect(quadrants()).toEqual(['bottom-left', 'bottom-right'])
    expect(
      document.querySelector('[data-frozen-quadrant="bottom-left"] [data-cell="0:0"]'),
    ).toBeTruthy()
    expect(
      document.querySelector('[data-frozen-quadrant="bottom-right"] [data-cell="0:1"]'),
    ).toBeTruthy()
  })

  it('renders all four quadrants while preserving formatted selected cells', () => {
    render(
      <SpreadsheetFrozenGridView
        cells={[{ ...cell(0, 0, 'frozen'), format: { bold: true } }]}
        freeze={{ rows: 1, cols: 1 }}
        metrics={METRICS}
        selected={{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }}
      />,
    )

    expect(quadrants()).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    const frozenCell = document.querySelector('[data-frozen-quadrant="top-left"] [data-cell="0:0"]')
    expect(frozenCell?.getAttribute('data-selected')).toBe('true')
    expect((frozenCell as HTMLTableCellElement).style.fontWeight).toBe('bold')
  })

  it('clamps freeze counts that exceed the available rows and columns', () => {
    render(
      <SpreadsheetFrozenGridView cells={[]} freeze={{ rows: 99, cols: 99 }} metrics={METRICS} />,
    )

    expect(quadrants()).toEqual(['top-left'])
    expect(document.querySelectorAll('[data-frozen-quadrant="top-left"] td')).toHaveLength(16)
  })
})
