import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react'
import { SpreadsheetGridView } from '../src/SpreadsheetGridView'

const WINDOW = { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 2 }

function cell(row: number, col: number, displayValue: string, formula?: string): DisplayCell {
  return { row, col, displayValue, formula }
}

describe('SpreadsheetGridView', () => {
  it('projects sparse cells into a complete read-only table', () => {
    render(<SpreadsheetGridView window={WINDOW} cells={[cell(0, 0, 'A1'), cell(1, 2, 'C2')]} />)

    expect(document.querySelectorAll('td')).toHaveLength(6)
    expect(document.querySelector('[data-cell="0:0"]')?.textContent).toBe('A1')
    expect(document.querySelector('[data-cell="1:2"]')?.textContent).toBe('C2')
    expect(document.querySelector('[data-cell="0:1"]')?.textContent).toBe('')
  })

  it('marks the caller-owned selected range without adding interaction state', () => {
    render(
      <SpreadsheetGridView
        window={WINDOW}
        cells={[]}
        selected={{ rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 2 }}
      />,
    )

    expect(document.querySelector('[data-cell="0:1"]')?.getAttribute('data-selected')).toBe('true')
    expect(document.querySelector('[data-cell="0:2"]')?.className).toContain('cell-selected')
    expect(document.querySelector('[data-cell="1:1"]')?.getAttribute('data-selected')).toBeNull()
  })

  it('renders a formula cell by its projected display value', () => {
    render(<SpreadsheetGridView window={WINDOW} cells={[cell(0, 2, '3', '=A1+B1')]} />)

    expect(document.querySelector('[data-cell="0:2"]')?.textContent).toBe('3')
  })

  it('maps projected cell format to safe presentation styles without recomputing its display value', () => {
    render(
      <SpreadsheetGridView
        window={WINDOW}
        cells={[
          {
            row: 0,
            col: 0,
            displayValue: '3',
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
              numberFormat: { kind: 'currency', digits: 2, symbol: '$' },
              overflow: 'clip',
              rotation: 45,
              strikethrough: true,
              underline: true,
              verticalAlign: 'center',
            },
          },
        ]}
      />,
    )

    const formatted = document.querySelector('[data-cell="0:0"]') as HTMLTableCellElement
    expect(formatted.textContent).toBe('3')
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
  })

  it('ignores conditional formatting and unsafe presentation values', () => {
    render(
      <SpreadsheetGridView
        window={WINDOW}
        cells={[
          {
            row: 0,
            col: 0,
            displayValue: 'safe',
            conditionalFormat: { bgColor: '#000000', bold: true },
            format: {
              bgColor: 'red; background-image: url(https://example.test/pixel)',
              fgColor: 'url(https://example.test/pixel)',
              fontFamily: 'Aptos; color: red',
              fontSize: Number.POSITIVE_INFINITY,
            },
          },
        ]}
      />,
    )

    const formatted = document.querySelector('[data-cell="0:0"]') as HTMLTableCellElement
    expect(formatted.textContent).toBe('safe')
    expect(formatted.style.backgroundColor).toBe('')
    expect(formatted.style.color).toBe('')
    expect(formatted.style.fontFamily).toBe('')
    expect(formatted.style.fontSize).toBe('')
    expect(formatted.style.fontWeight).toBe('')
  })
})
