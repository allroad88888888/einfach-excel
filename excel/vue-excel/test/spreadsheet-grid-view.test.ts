import { describe, expect, it } from 'vitest'
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

  it('maps projected cell format to safe styles without recomputing the display value', () => {
    const { app, host } = mountGrid([
      {
        row: 2,
        col: 4,
        displayValue: '3',
        formula: '=1+2',
        numericValue: 3,
        format: {
          align: 'right',
          bgColor: '#ffeecc',
          bold: true,
          borders: { top: { style: 'dashed', color: '#ff0000' } },
          fgColor: '#112233',
          fontFamily: 'Aptos, Arial',
          fontSize: 14,
          indent: 2,
          italic: true,
          overflow: 'clip',
          rotation: 45,
          strikethrough: true,
          underline: true,
          verticalAlign: 'center',
        },
      },
    ])

    const formatted = cell(host, 2, 4)
    expect(formatted).toHaveTextContent('3')
    expect(formatted.textContent).not.toContain('=1+2')
    expect(formatted.style.fontWeight).toBe('bold')
    expect(formatted.style.fontStyle).toBe('italic')
    expect(formatted.style.textDecoration).toBe('underline line-through')
    expect(formatted.style.textAlign).toBe('right')
    expect(formatted.style.verticalAlign).toBe('middle')
    expect(formatted.style.color).toBe('rgb(17, 34, 51)')
    expect(formatted.style.backgroundColor).toBe('rgb(255, 238, 204)')
    expect(formatted.style.fontFamily).toBe('Aptos, Arial')
    expect(formatted.style.fontSize).toBe('14px')
    expect(formatted.style.paddingLeft).toBe('16px')
    expect(formatted.style.borderTopStyle).toBe('dashed')
    expect(formatted.style.borderTopColor).toBe('#ff0000')
    expect(formatted.style.transform).toBe('rotate(45deg)')
    expect(formatted.style.whiteSpace).toBe('nowrap')
    expect(formatted.style.overflow).toBe('hidden')
    expect(formatted.style.textOverflow).toBe('ellipsis')

    app.unmount()
  })

  it('ignores conditional formatting and unsafe presentation values', () => {
    const { app, host } = mountGrid([
      {
        row: 2,
        col: 4,
        displayValue: 'safe',
        conditionalFormat: { bgColor: '#000000', bold: true },
        format: {
          bgColor: 'red; background-image: url(https://example.test/pixel)',
          fgColor: 'url(https://example.test/pixel)',
          fontFamily: 'Aptos; color: red',
          fontSize: Number.POSITIVE_INFINITY,
        },
      },
    ])

    const formatted = cell(host, 2, 4)
    expect(formatted).toHaveTextContent('safe')
    expect(formatted.style.backgroundColor).toBe('')
    expect(formatted.style.color).toBe('')
    expect(formatted.style.fontFamily).toBe('')
    expect(formatted.style.fontSize).toBe('')
    expect(formatted.style.fontWeight).toBe('')

    app.unmount()
  })

  it('removes the grid DOM when its Vue app unmounts', () => {
    const { app, host } = mountGrid([])

    app.unmount()

    expect(host).toBeEmptyDOMElement()
  })
})
