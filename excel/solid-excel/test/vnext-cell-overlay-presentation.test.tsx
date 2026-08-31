/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetCellDisplayValue } from '../src/grid/SpreadsheetCellDisplayValue'

afterEach(cleanup)

function renderValue(cell: DisplayCell | undefined) {
  let cellClickCount = 0
  let cellPointerDownCount = 0
  let cellDoubleClickCount = 0
  const utils = render(() => (
    <div
      onClick={() => {
        cellClickCount += 1
      }}
      onPointerDown={() => {
        cellPointerDownCount += 1
      }}
      onDblClick={() => {
        cellDoubleClickCount += 1
      }}
    >
      <SpreadsheetCellDisplayValue cell={cell} />
    </div>
  ))
  return {
    ...utils,
    getCellClickCount: () => cellClickCount,
    getCellPointerDownCount: () => cellPointerDownCount,
    getCellDoubleClickCount: () => cellDoubleClickCount,
  }
}

function cellWithRichValue(richValue: NonNullable<DisplayCell['richValue']>): DisplayCell {
  return {
    row: 0,
    col: 0,
    displayValue: 'fallback',
    valueKind: 'string',
    richValue,
  }
}

describe('SpreadsheetCellDisplayValue', () => {
  it('renders a safe rich hyperlink as an independent keyboard-accessible link', () => {
    const { container, getCellPointerDownCount, getCellClickCount, getCellDoubleClickCount } =
      renderValue(cellWithRichValue({ kind: 'hyperlink', url: '#details', label: 'Details' }))

    const link = container.querySelector('.cell-rich-link') as HTMLAnchorElement
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('#details')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')

    fireEvent.pointerDown(link)
    fireEvent.click(link)
    fireEvent.doubleClick(link)
    expect(getCellPointerDownCount()).toBe(0)
    expect(getCellClickCount()).toBe(0)
    expect(getCellDoubleClickCount()).toBe(0)
  })

  it('keeps unsafe rich hyperlink payloads non-navigable while preserving their display label', () => {
    const { container } = renderValue(
      cellWithRichValue({ kind: 'hyperlink', url: 'javascript:alert(1)', label: 'Unsafe link' }),
    )

    const value = container.querySelector('.cell-rich-link') as HTMLElement
    expect(value.tagName).toBe('SPAN')
    expect(value.getAttribute('data-rich-url')).toBe('javascript:alert(1)')
    expect(value.textContent).toBe('Unsafe link')
  })

  it('renders rich-text runs and scalar rich values without relying on a cell atom', () => {
    const { container } = renderValue(
      cellWithRichValue({
        kind: 'rich-text',
        runs: [
          { text: 'Total ', format: { bold: true } },
          { text: '42', format: { italic: true, color: '#0f766e' } },
        ],
      }),
    )

    const runs = container.querySelectorAll('.cell-rich-text span')
    expect(container.textContent).toBe('Total 42')
    expect((runs[0] as HTMLElement).style.fontWeight).toBe('700')
    expect((runs[1] as HTMLElement).style.fontStyle).toBe('italic')
    expect((runs[1] as HTMLElement).style.color).toBe('rgb(15, 118, 110)')

    expect(
      renderValue(cellWithRichValue({ kind: 'number', value: 42 })).container.textContent,
    ).toBe('42')
    expect(
      renderValue(cellWithRichValue({ kind: 'boolean', value: true })).container.textContent,
    ).toBe('true')
    expect(
      renderValue(cellWithRichValue({ kind: 'error', code: '#REF!', message: 'Missing reference' }))
        .container.textContent,
    ).toBe('Missing reference')
  })
})
