import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { textFormatPlugin } from '../src'
import { renderFormattingRibbon } from '../../../excel/react-excel/test/support/formatting-ribbon-harness'

test('shrink is optional and leaves the original wrap control available', async () => {
  await renderFormattingRibbon()
  expect(screen.queryByRole('button', { name: 'Shrink to fit' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Wrap text' })).toBeEnabled()
})

test('shrink and wrap use one write per click without changing the nominal size', async () => {
  const { writes } = await renderFormattingRibbon(undefined, [textFormatPlugin])
  const shrink = screen.getByRole('button', { name: 'Shrink to fit' })
  const wrap = screen.getByRole('button', { name: 'Wrap text' })
  expect(shrink).toHaveAttribute('data-ribbon-item', 'format.shrink-to-fit')
  await act(async () => { fireEvent.click(shrink) })
  expect(shrink).toHaveAttribute('aria-pressed', 'true')
  expect(wrap).toHaveAttribute('aria-pressed', 'false')
  await act(async () => { fireEvent.click(wrap) })
  expect(shrink).toHaveAttribute('aria-pressed', 'false')
  expect(wrap).toHaveAttribute('aria-pressed', 'true')
  await act(async () => { fireEvent.click(shrink) })
  await act(async () => { fireEvent.click(shrink) })
  expect(shrink).toHaveAttribute('aria-pressed', 'false')
  expect(writes.map(write => write.format)).toEqual([
    { shrinkToFit: true, wrap: false }, { wrap: true, shrinkToFit: false },
    { shrinkToFit: true, wrap: false }, { shrinkToFit: false },
  ])
  expect(screen.getByRole('combobox', { name: 'Font size' })).toHaveValue('12')
})
