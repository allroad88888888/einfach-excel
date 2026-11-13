import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

test('native baseline buttons have independent stable IDs and mutually exclusive pressed state', async () => {
  const { writes } = await renderFormattingRibbon()
  const superscript = screen.getByRole('button', { name: 'Superscript' })
  const subscript = screen.getByRole('button', { name: 'Subscript' })
  expect(superscript).toHaveAttribute('data-ribbon-item', 'format.superscript')
  expect(subscript).toHaveAttribute('data-ribbon-item', 'format.subscript')
  expect(superscript).toHaveAttribute('aria-pressed', 'false')
  await act(async () => { fireEvent.click(superscript) })
  expect(superscript).toHaveAttribute('aria-pressed', 'true')
  expect(subscript).toHaveAttribute('aria-pressed', 'false')
  await act(async () => { fireEvent.click(subscript) })
  expect(superscript).toHaveAttribute('aria-pressed', 'false')
  expect(subscript).toHaveAttribute('aria-pressed', 'true')
  await act(async () => { fireEvent.click(subscript) })
  expect(subscript).toHaveAttribute('aria-pressed', 'false')
  expect(writes.map(write => write.format)).toEqual([
    { fontBaseline: 'superscript' }, { fontBaseline: 'subscript' }, { fontBaseline: 'normal' },
  ])
  expect(screen.getByRole('combobox', { name: 'Font size' })).toHaveValue('12')
})
