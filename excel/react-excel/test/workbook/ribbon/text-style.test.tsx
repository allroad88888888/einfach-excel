import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

describe('Workbook ribbon text styles', () => {
  test('toggles four text decorations on the selected Rust range', async () => {
    const { writes } = await renderFormattingRibbon()

    for (const label of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: label })).toHaveAttribute(
          'aria-pressed',
          'true',
        ),
      )
    }

    expect(writes).toHaveLength(4)
    expect(writes.map((write) => write.format)).toEqual([
      { bold: true },
      { italic: true },
      { underline: true },
      { strikethrough: true },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    )
    expect(writes[4]?.format).toEqual({ bold: false })
  })
})
