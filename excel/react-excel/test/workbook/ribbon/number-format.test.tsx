import {
  SELECTION_CURRENCY_FORMAT,
  SELECTION_PERCENT_FORMAT,
  SELECTION_THOUSANDS_FORMAT,
} from '@einfach/spreadsheet-ui-core'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

describe('Workbook ribbon number formats', () => {
  test('plain decimal precision does not activate thousands grouping', async () => {
    const { writes } = await renderFormattingRibbon()
    const thousands = screen.getByRole('button', { name: 'Thousands format' })
    fireEvent.click(screen.getByRole('button', { name: 'Increase decimal places' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(thousands).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(thousands)
    await waitFor(() => expect(thousands).toHaveAttribute('aria-pressed', 'true'))
    expect(writes.at(-1)?.format?.numberFormat).toEqual(SELECTION_THOUSANDS_FORMAT)
  })

  test('adjusts precision and resets general with button state from the returned projection', async () => {
    const { writes } = await renderFormattingRibbon()
    const general = screen.getByRole('button', { name: 'General format' })
    expect(general).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Currency format' }))
    await waitFor(() => expect(general).toHaveAttribute('aria-pressed', 'false'))

    fireEvent.click(screen.getByRole('button', { name: 'Increase decimal places' }))
    await waitFor(() =>
      expect(writes.at(-1)?.format?.numberFormat).toEqual({
        kind: 'currency',
        symbol: '$',
        digits: 3,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Decrease decimal places' }))
    await waitFor(() =>
      expect(writes.at(-1)?.format?.numberFormat).toEqual(SELECTION_CURRENCY_FORMAT),
    )
    fireEvent.click(general)
    await waitFor(() => expect(general).toHaveAttribute('aria-pressed', 'true'))
    expect(writes.at(-1)?.format).toEqual({ numberFormat: { kind: 'general' } })
    expect(screen.getByRole('button', { name: 'Currency format' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(writes).toHaveLength(4)
  })

  test('dispatches percent, currency and thousands formats', async () => {
    const { writes } = await renderFormattingRibbon()
    const cases = [
      ['Percent format', SELECTION_PERCENT_FORMAT],
      ['Currency format', SELECTION_CURRENCY_FORMAT],
      ['Thousands format', SELECTION_THOUSANDS_FORMAT],
    ] as const

    for (const [index, [label, numberFormat]] of cases.entries()) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      await waitFor(() => expect(writes).toHaveLength(index + 1))
      expect(writes.at(-1)?.format).toEqual({ numberFormat })
      await waitFor(() =>
        expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true'),
      )
    }
  })
})
