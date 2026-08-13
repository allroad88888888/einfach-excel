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
})
