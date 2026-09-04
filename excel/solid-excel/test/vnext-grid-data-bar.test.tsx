/** @jsxImportSource solid-js */

import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'
import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import { withDataBarProjection } from '../src/adapter/data-bar-projection'
import { SpreadsheetGridDataBar } from '../src/grid/SpreadsheetGridDataBar'

afterEach(cleanup)

const NUMBER_CELL: DisplayCell = {
  row: 0,
  col: 0,
  displayValue: '42',
  valueKind: 'number',
  numericValue: 42,
}

describe('SpreadsheetGridDataBar', () => {
  test('renders a decorative, non-focusable bar below cell content', () => {
    const { container } = render(() => (
      <SpreadsheetGridDataBar
        cell={withDataBarProjection(NUMBER_CELL, {
          ratio: 0.5,
          minColor: '#eff6ff',
          maxColor: '#1d4ed8',
        })}
      />
    ))
    const bar = container.querySelector('.spreadsheet-grid-data-bar')
    expect(bar).not.toBeNull()
    expect(bar?.getAttribute('aria-hidden')).toBe('true')
    expect(bar?.hasAttribute('tabindex')).toBe(false)
    expect(bar?.getAttribute('data-ratio')).toBe('0.5')
    expect((bar as HTMLElement).style.width).toBe('50%')
  })

  test('does not render for cells without the canonical display projection', () => {
    const { container } = render(() => <SpreadsheetGridDataBar cell={NUMBER_CELL} />)
    expect(container.querySelector('.spreadsheet-grid-data-bar')).toBeNull()
  })

  test('fails closed before unsafe metadata reaches CSS variables', () => {
    const unsafeCell = {
      ...NUMBER_CELL,
      dataBar: {
        ratio: 0.5,
        minColor: 'red; width: 100%',
        maxColor: 'url(javascript:alert(1))',
      },
    } as unknown as DisplayCell
    const { container } = render(() => <SpreadsheetGridDataBar cell={unsafeCell} />)
    expect(container.querySelector('.spreadsheet-grid-data-bar')).toBeNull()
  })
})
