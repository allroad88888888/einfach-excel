import { setMultiRegionSelectionAtom } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'

test.each(['Bold', 'Italic', 'Underline', 'Text color', 'Fill color', 'Percent format'])(
  '%s uses the existing toolbar for every selected area', async (name) => {
    const { store, writes } = await renderFormattingRibbon()
    act(() => store.setter(setMultiRegionSelectionAtom, { regions: [
      { kind: 'cell', sheetId: 'sheet-1', anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
      { kind: 'range', sheetId: 'sheet-1', anchor: { row: 3, col: 2 }, focus: { row: 4, col: 2 } },
    ] }))
    fireEvent.click(screen.getByRole('button', { name }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].targets).toEqual([
      { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0, scope: 'cell' },
      { rowStart: 3, rowEnd: 4, colStart: 2, colEnd: 2, scope: 'cell' },
    ])
  },
)
