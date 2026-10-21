import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { CellMetadata } from '../../src/cell-metadata/CellMetadata'

test('notes and comments coexist and native icon metadata is rendered directly', () => {
  const cell = { row: 0, col: 0, displayValue: '50', noteIndicator: true,
    commentIndicator: true, conditionalIcon: {
      set: 'three-arrows' as const, index: 2 as const, showValue: false,
    } }
  const { container, rerender } = render(<CellMetadata cell={cell}
    labels={{ note: '有备注', comment: '有批注' }} />)
  expect(screen.getByRole('img', { name: '有备注' })).toHaveAttribute('data-cell-note', 'true')
  expect(screen.getByRole('img', { name: '有批注' })).toHaveAttribute('data-cell-comment', 'true')
  expect(container.querySelector('[data-conditional-icon]')).toHaveTextContent('↑')
  expect(container.querySelector('[data-conditional-icon]')).toHaveAttribute('data-icon-index', '2')
  expect(container.querySelector('[data-conditional-icon]')).toHaveAttribute('aria-hidden', 'true')
  rerender(
    <CellMetadata cell={{ ...cell, noteIndicator: undefined, conditionalIcon: undefined }} />,
  )
  expect(container.querySelector('[data-cell-note]')).toBeNull()
  expect(container.querySelector('[data-cell-comment]')).not.toBeNull()
  expect(container.querySelector('[data-conditional-icon]')).toBeNull()
})
