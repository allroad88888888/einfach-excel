import { createStore } from '@einfach/core'
import { Provider } from '@einfach/react'
import type { DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SpreadsheetGrid } from '../src/SpreadsheetGrid'

const grid = (cells: DisplayCell[]) => <Provider store={createStore()}>
  <SpreadsheetGrid cells={cells} window={{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 }} />
</Provider>

test('section color overrides the user font color and leaves unformatted neighbours alone', () => {
  const { container } = render(grid([
    { row: 0, col: 0, displayValue: '(1,234.50)', valueKind: 'number',
      format: { fgColor: '#00ff00', numberFormat: { kind: 'custom', pattern: '0;[Red](0)' } },
      numberFormatDisplay: { color: '#ff0000' } },
    { row: 0, col: 1, displayValue: '5', valueKind: 'number', format: { fgColor: '#00ff00' } },
  ]))
  expect(container.querySelector('[data-cell="0:0"]')).toHaveStyle({ color: '#ff0000' })
  expect(container.querySelector('[data-cell="0:1"]')).toHaveStyle({ color: '#00ff00' })
})

test('fill splits text at the Rust mark and custom spacing is preserved', () => {
  const { container } = render(grid([
    { row: 0, col: 0, displayValue: ' $1,234.50 ', valueKind: 'number',
      format: { numberFormat: { kind: 'custom', pattern: '_($* #,##0.00_)' } },
      numberFormatDisplay: { fill: { char: ' ', at: 2 } } },
    { row: 0, col: 1, displayValue: '7', valueKind: 'number',
      format: { numberFormat: { kind: 'custom', pattern: '0*-' } },
      numberFormatDisplay: { fill: { char: '-', at: 1 } } },
  ]))
  const accounting = container.querySelector('[data-cell="0:0"] .cell-fill-text')!
  expect(accounting.querySelector('.cell-fill-start')!.textContent).toBe(' $')
  expect(accounting.querySelector('.cell-fill-repeat')!.textContent).toBe('')
  expect(accounting.querySelector('.cell-fill-end')!.textContent).toBe('1,234.50 ')
  expect(container.querySelector('[data-cell="0:0"] .cell-content')).toHaveStyle({ whiteSpace: 'pre' })
  const dashes = container.querySelector('[data-cell="0:1"] .cell-fill-repeat')!
  expect(dashes.textContent).toMatch(/^-+$/)
  expect(dashes).toHaveAttribute('aria-hidden', 'true')
})

test('underscore pads keep an invisible copy of the character so its width is reserved', () => {
  const { container } = render(grid([
    { row: 0, col: 0, displayValue: ' 7', valueKind: 'number',
      format: { numberFormat: { kind: 'custom', pattern: '_W0' } },
      numberFormatDisplay: { pads: [{ char: 'W', at: 0 }] } },
    { row: 0, col: 1, displayValue: ' $7 ', valueKind: 'number',
      format: { numberFormat: { kind: 'custom', pattern: '_($* 0_)' } },
      numberFormatDisplay: { fill: { char: ' ', at: 2 },
        pads: [{ char: '(', at: 0 }, { char: ')', at: 3 }] } },
  ]))
  const pad = container.querySelector('[data-cell="0:0"] .cell-pad')!
  expect(pad.textContent).toBe('W')
  expect(pad).toHaveAttribute('aria-hidden', 'true')
  expect(container.querySelector('[data-cell="0:0"] .cell-number-text')!.textContent).toBe('W7')
  const accounting = container.querySelector('[data-cell="0:1"] .cell-fill-text')!
  expect(accounting.querySelector('.cell-fill-start')!.textContent).toBe('($')
  expect(accounting.querySelector('.cell-fill-end')!.textContent).toBe('7)')
  expect(accounting.querySelectorAll('.cell-pad')).toHaveLength(2)
})
