import { createStore } from '@einfach/core'
import { Provider } from '@einfach/react'
import type { DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SpreadsheetGrid } from '../src/SpreadsheetGrid'
import { RichCellText } from '../src/RichCellText'

test('grid preserves escaped rich runs and returns to ordinary text after replacement', () => {
  const store = createStore()
  const cell: DisplayCell = {
    row: 0, col: 0, displayValue: '<b>红🙂</b> plain', valueKind: 'text',
    format: { bold: true, underline: true },
    richText: [
      { text: '<b>红🙂</b>', format: { color: '#FF0000', bold: false, underline: false } },
      { text: ' plain', format: { italic: true } },
    ],
  }
  const view = (value: DisplayCell) => <Provider store={store}>
    <SpreadsheetGrid cells={[value]} window={{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }} />
  </Provider>
  const { container, rerender } = render(view(cell))
  const content = container.querySelector('.cell-content')!
  expect(content).toHaveTextContent('<b>红🙂</b> plain')
  expect(content.querySelector('b')).toBeNull()
  expect(content.children).toHaveLength(2)
  expect(content.children[0]).toHaveStyle({ color: '#FF0000', fontWeight: '400', textDecoration: 'none' })
  expect(content.children[1]).toHaveStyle({ fontWeight: '700', fontStyle: 'italic', textDecoration: 'underline' })

  rerender(view({ row: 0, col: 0, displayValue: '<i>ordinary</i>', valueKind: 'text' }))
  expect(content).toHaveTextContent('<i>ordinary</i>')
  expect(content.children).toHaveLength(0)
  expect(content.firstChild?.nodeType).toBe(Node.TEXT_NODE)
})

test('formula display uses the supplied source text instead of rich run content', () => {
  const { container } = render(<RichCellText text="=SUM(A1:A2)" showFormulas
    cell={{ row: 0, col: 0, displayValue: '3', richText: [
      { text: '3', format: { bold: true } },
    ] }} />)
  expect(container).toHaveTextContent('=SUM(A1:A2)')
  expect(container.querySelector('span')).toBeNull()
})
