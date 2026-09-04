import {
  SELECTION_CURRENCY_FORMAT,
  SELECTION_PERCENT_FORMAT,
  SELECTION_THOUSANDS_FORMAT,
} from '@einfach/spreadsheet-ui-core'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

describe('Workbook ribbon number formats', () => {
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
