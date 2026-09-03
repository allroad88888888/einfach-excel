import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react'
import { SpreadsheetGrid } from '../../../src/workbook/grid/cells/SpreadsheetGrid'

describe('spreadsheet selection outline', () => {
  it('marks only the outside edges of a multi-cell selection', () => {
    const { container } = render(
      <SpreadsheetGrid
        cells={[]}
        selected={{ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }}
        window={{ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }}
      />,
    )

    expect(cell(container, '1:1')).toHaveClass('cell-selected')
    expect(container.querySelectorAll('.cell-selected')).toHaveLength(9)

    const outline = container.querySelector<HTMLElement>('.selection-outline')
    expect(outline).toHaveClass(
      'selection-outline-top',
      'selection-outline-right',
      'selection-outline-bottom',
      'selection-outline-left',
    )
    expect(outline?.style.getPropertyValue('--selection-col-span')).toBe('3')
    expect(outline?.style.getPropertyValue('--selection-row-span')).toBe('3')
  })
})

function cell(container: HTMLElement, coordinate: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-cell="${coordinate}"]`)
  if (!element) throw new Error(`Missing cell ${coordinate}`)
  return element
}
