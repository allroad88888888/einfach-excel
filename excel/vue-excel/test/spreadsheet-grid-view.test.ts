import { describe, expect, it } from '@jest/globals'
import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'
import { createApp, h } from 'vue'
import { SpreadsheetGridView } from '../src'

const RANGE: CellRange = { rowStart: 2, rowEnd: 3, colStart: 4, colEnd: 5 }

function mountGrid(cells: readonly DisplayCell[], selected: CellRange | null = null) {
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(SpreadsheetGridView, { cells, range: RANGE, selected }),
  })
  app.mount(host)
  return { app, host }
}

function cell(host: HTMLElement, row: number, col: number): HTMLTableCellElement {
  const renderedCell = host.querySelector<HTMLTableCellElement>(
    `[data-row="${row}"][data-col="${col}"]`,
  )
  if (!renderedCell) throw new Error(`Missing rendered cell ${row}:${col}.`)
  return renderedCell
}

describe('SpreadsheetGridView', () => {
  it('projects sparse cells and renders missing coordinates as blank cells', () => {
    const { app, host } = mountGrid([{ row: 2, col: 5, displayValue: 'present' }])

    expect(host.querySelector('[role="grid"]')).toHaveAttribute('aria-rowcount', '2')
    expect(host.querySelector('[role="grid"]')).toHaveAttribute('aria-colcount', '2')
    expect(cell(host, 2, 4)).toHaveTextContent('')
    expect(cell(host, 2, 5)).toHaveTextContent('present')
    expect(cell(host, 3, 4)).toHaveTextContent('')
    expect(cell(host, 3, 5)).toHaveTextContent('')

    app.unmount()
  })

  it('renders formula display values and marks cells in the selected range', () => {
    const selected: CellRange = { rowStart: 2, rowEnd: 2, colStart: 5, colEnd: 5 }
    const { app, host } = mountGrid(
      [
        { row: 2, col: 4, displayValue: '2', formula: '=1+1' },
        { row: 2, col: 5, displayValue: 'selected' },
      ],
      selected,
    )

    expect(cell(host, 2, 4)).toHaveTextContent('2')
    expect(cell(host, 2, 4).textContent).not.toContain('=1+1')
    expect(cell(host, 2, 4)).toHaveAttribute('aria-selected', 'false')
    expect(cell(host, 2, 5)).toHaveAttribute('aria-selected', 'true')
    expect(cell(host, 2, 5)).toHaveAttribute('data-selected', 'true')

    app.unmount()
  })

  it('removes the grid DOM when its Vue app unmounts', () => {
    const { app, host } = mountGrid([])

    app.unmount()

    expect(host).toBeEmptyDOMElement()
  })
})
