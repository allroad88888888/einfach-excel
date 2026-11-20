import { createStore } from '@einfach/core'
import { Provider } from '@einfach/react'
import type { DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SpreadsheetGrid } from '../src/SpreadsheetGrid'
import { RichCellText } from '../src/RichCellText'
import { NumberFormatText } from '../src/NumberFormatText'

test('whole-cell glyph effect leaves nominal cell font untouched and restores the plain text fast path', () => {
  const cell: DisplayCell = { row: 0, col: 0, displayValue: '中文🙂12.5', valueKind: 'text',
    format: { fontSize: 20, fontBaseline: 'superscript', underline: true } }
  const store = createStore()
  const view = (value: DisplayCell) => <Provider store={store}>
    <SpreadsheetGrid cells={[value]} window={{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }} />
  </Provider>
  const { container, rerender } = render(view(cell))
  expect(container.querySelector('td')).toHaveStyle({ fontSize: '20px' })
  expect(container.querySelector('[data-font-baseline]')).toHaveStyle({
    fontSize: '13px', verticalAlign: '6px', textDecoration: 'underline',
  })
  rerender(view({ ...cell, format: { ...cell.format, fontBaseline: 'normal' } }))
  expect(container.querySelector('.cell-content')!.firstChild!.nodeType).toBe(Node.TEXT_NODE)
})

test('each rich run resolves inheritance exactly once and explicit normal keeps nominal size', () => {
  const { container } = render(<RichCellText showFormulas={false} text="H2O" cell={{
    row: 0, col: 0, displayValue: 'H2O', format: { fontSize: 20, fontBaseline: 'superscript' },
    richText: [
      { text: 'H', format: {} },
      { text: '2', format: { fontBaseline: 'normal', bold: true } },
      { text: 'O', format: { fontBaseline: 'subscript' } },
    ],
  }} />)
  const spans = container.querySelectorAll('span')
  expect(spans[0]).toHaveStyle({ fontSize: '13px', verticalAlign: '6px' })
  expect(spans[1]).toHaveStyle({ fontSize: '20px', fontWeight: '700' })
  expect(spans[2]).toHaveStyle({ fontSize: '13px', verticalAlign: '-4px' })
})

test('Accounting fill owns full width while baseline applies to glyph and pad groups', () => {
  const { container } = render(<NumberFormatText text=" $1 " format={{
    fontSize: 20, fontBaseline: 'subscript',
  }} display={{ fill: { char: ' ', at: 2 }, pads: [{ char: 'W', at: 0 }, { char: ')', at: 3 }] }} />)
  expect(container.querySelector('.cell-fill-text')!.getAttribute('style')).toBeNull()
  expect(container.querySelectorAll('[data-font-baseline]')).toHaveLength(3)
  expect(container.querySelector('.cell-pad')).toHaveTextContent('W')
  expect(container.querySelector('.cell-fill-end [data-font-baseline]')).toHaveStyle({ fontSize: '13px' })
})
