import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

describe('Workbook ribbon text layout', () => {
  test('sets font family, font size and wrap text', async () => {
    const { writes } = await renderFormattingRibbon()

    fireEvent.change(screen.getByRole('combobox', { name: 'Font family' }), {
      target: { value: 'Georgia' },
    })
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]?.format).toEqual({ fontFamily: 'Georgia' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Font size' }), {
      target: { value: '16' },
    })
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1]?.format).toEqual({ fontSize: 16 })

    const wrap = screen.getByRole('button', { name: 'Wrap text' })
    fireEvent.click(wrap)
    await waitFor(() => expect(wrap).toHaveAttribute('aria-pressed', 'true'))
    expect(writes[2]?.format).toEqual({ wrap: true })

    const increaseIndent = screen.getByRole('button', { name: 'Increase indent' })
    fireEvent.click(increaseIndent)
    await waitFor(() => expect(writes).toHaveLength(4))
    expect(writes[3]?.format).toEqual({ indent: 1 })
    fireEvent.click(increaseIndent)
    await waitFor(() => expect(writes).toHaveLength(5))
    expect(writes[4]?.format).toEqual({ indent: 2 })

    fireEvent.click(screen.getByRole('button', { name: 'Decrease indent' }))
    await waitFor(() => expect(writes).toHaveLength(6))
    expect(writes[5]?.format).toEqual({ indent: 1 })
  })
})
