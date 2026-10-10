import {
  SELECTION_ALL_BORDERS,
  SELECTION_FILL_COLOR,
  SELECTION_TEXT_COLOR,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

describe('Workbook ribbon cell appearance', () => {
  test('applies fill color, text color and horizontal alignment', async () => {
    const { writes } = await renderFormattingRibbon()

    fireEvent.click(screen.getByRole('button', { name: 'Fill color' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]?.format).toEqual({ bgColor: SELECTION_FILL_COLOR })

    fireEvent.click(screen.getByRole('button', { name: 'Text color' }))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1]?.format).toEqual({ fgColor: SELECTION_TEXT_COLOR })

    const alignment = screen.getByRole('combobox', { name: 'Horizontal alignment' })
    await act(async () => { fireEvent.change(alignment, { target: { value: 'center' } }) })
    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes[2]?.format).toMatchObject({ align: 'center' })
    await act(async () => { fireEvent.change(alignment, { target: { value: 'right' } }) })
    await waitFor(() => expect(writes).toHaveLength(4))
    expect(writes[3]?.format).toMatchObject({ align: 'right' })
  })

  test('applies vertical alignment, text rotation and borders', async () => {
    const { writes } = await renderFormattingRibbon()

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Vertical alignment' }),
        { target: { value: 'top' } })
    })
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]?.format).toEqual({ verticalAlign: 'top' })

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Text rotation' }),
        { target: { value: '45' } })
    })
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1]?.format).toEqual({ rotation: 45 })

    fireEvent.click(screen.getByRole('button', { name: 'Borders' }))
    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes[2]?.format).toEqual({ borders: SELECTION_ALL_BORDERS })
  })
})
