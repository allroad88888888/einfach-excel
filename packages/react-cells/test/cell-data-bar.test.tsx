import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { CellDataBar } from '../src/CellDataBar'

test('renders the native percentage coordinates without computing a second scale', () => {
  const { container, rerender } = render(<CellDataBar bar={{ left: 10, width: 30, axis: 40, color: '#ff0000' }} />)
  expect(container.querySelector('.cell-data-bar-fill')).toHaveStyle({ left: '10%', width: '30%', backgroundColor: '#ff0000' })
  expect(container.querySelector('.cell-data-bar-axis')).toHaveStyle({ left: '40%' })
  expect(container.querySelector('.cell-data-bar')).toHaveAttribute('aria-hidden', 'true')
  rerender(<CellDataBar bar={{ left: 0, width: 100, color: '#0000ff' }} />)
  expect(container.querySelector('.cell-data-bar-axis')).toBeNull()
  rerender(<CellDataBar bar={undefined} />)
  expect(container).toBeEmptyDOMElement()
})
